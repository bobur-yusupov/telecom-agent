import { createTool } from '@mastra/core/tools';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logAudit } from '../db/audit.js';
import { db } from '../db/client.js';
import { plans, subscriptions, usage } from '../db/schema.js';
import { createGuardedTool } from '../guard/createGuardedTool.js';
import { subscriptionMatchesPlan } from '../sensors/index.js';
import { traceId } from './context.js';

// ------------------------------------------------------------ read tools ---

export const getCurrentPlan = createTool({
  id: 'getCurrentPlan',
  description: 'Get a customer’s current plan, price, cycle dates, and how many plan changes they’ve made this cycle.',
  inputSchema: z.object({ customerId: z.string().uuid() }),
  execute: async ({ customerId }, ctx) => {
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.customerId, customerId),
      with: { plan: true, pendingPlan: true },
    });
    const result = sub
      ? {
          found: true as const,
          plan: { code: sub.plan.code, name: sub.plan.name, price: Number(sub.plan.price), tier: sub.plan.tier },
          pendingPlan: sub.pendingPlan ? { code: sub.pendingPlan.code, name: sub.pendingPlan.name, tier: sub.pendingPlan.tier } : null,
          cycleStart: sub.cycleStart,
          cycleEnd: sub.cycleEnd,
          status: sub.status,
          changesThisCycle: sub.changesThisCycle,
        }
      : { found: false as const };

    await logAudit({ traceId: traceId(ctx), customerId, toolName: 'getCurrentPlan', outcome: 'read', args: { customerId }, result });
    return result;
  },
});

export const listPlans = createTool({
  id: 'listPlans',
  description: 'List the plan catalog with tier and price.',
  inputSchema: z.object({}),
  execute: async (_args, ctx) => {
    const rows = await db.select().from(plans).where(eq(plans.active, true));
    const result = { plans: rows.map((p) => ({ code: p.code, name: p.name, price: Number(p.price), dataGb: p.dataGb, minutes: p.minutes, sms: p.sms, tier: p.tier })) };

    await logAudit({ traceId: traceId(ctx), toolName: 'listPlans', outcome: 'read', args: {}, result });
    return result;
  },
});

export const getUsage = createTool({
  id: 'getUsage',
  description: 'Get a customer’s data/minutes/SMS used this cycle vs their plan allowance. Recommendation logic (SPEC §8.2) must be derived from this, never the customer’s own estimate.',
  inputSchema: z.object({ customerId: z.string().uuid() }),
  execute: async ({ customerId }, ctx) => {
    const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.customerId, customerId), with: { plan: true } });
    if (!sub) {
      const result = { found: false as const };
      await logAudit({ traceId: traceId(ctx), customerId, toolName: 'getUsage', outcome: 'read', args: { customerId }, result });
      return result;
    }
    const u = await db.query.usage.findFirst({ where: eq(usage.subscriptionId, sub.id) });
    const dataUsedGb = Number(u?.dataUsedGb ?? 0);
    const result = {
      found: true as const,
      dataUsedGb,
      dataAllowanceGb: sub.plan.dataGb,
      dataUsedPct: Math.round((dataUsedGb / sub.plan.dataGb) * 100),
      minutesUsed: u?.minutesUsed ?? 0,
      minutesAllowance: sub.plan.minutes,
      smsUsed: u?.smsUsed ?? 0,
      smsAllowance: sub.plan.sms,
    };

    await logAudit({ traceId: traceId(ctx), customerId, toolName: 'getUsage', outcome: 'read', args: { customerId }, result });
    return result;
  },
});

// ----------------------------------------------------------- guarded tool --

// SPEC.md §5.2, §6.7, §7 — changePlan
export const changePlan = createGuardedTool({
  name: 'changePlan',
  description: 'Propose (then, with a token, commit) a plan change. Upgrades apply immediately; downgrades apply at cycle end and are limited to one per cycle.',
  schema: z.object({
    customerId: z.string().uuid(),
    targetPlanCode: z.string(),
  }),
  preconditions: async ({ customerId, targetPlanCode }) => {
    const targetPlan = await db.query.plans.findFirst({ where: eq(plans.code, targetPlanCode) });
    if (!targetPlan || !targetPlan.active) {
      return { ok: false, code: 'PLAN_INACTIVE', message: 'That plan is not currently available.' };
    }

    const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.customerId, customerId), with: { plan: true } });
    if (!sub) {
      return { ok: false, code: 'NO_SUBSCRIPTION', message: 'No active subscription found for this customer.' };
    }
    if (sub.planId === targetPlan.id) {
      return { ok: false, code: 'ALREADY_ON_PLAN', message: 'The customer is already on that plan.' };
    }
    const isDowngrade = targetPlan.tier < sub.plan.tier;
    if (isDowngrade && sub.changesThisCycle >= 1) {
      return { ok: false, code: 'DOWNGRADE_LIMIT_REACHED', message: 'Only one plan change is allowed per billing cycle, and one has already been made.' };
    }

    return { ok: true };
  },
  summarize: ({ targetPlanCode }) => `Change plan to ${targetPlanCode}`,
  commit: async ({ customerId, targetPlanCode }, _ctx, tx) => {
    const [targetPlan] = await tx.select().from(plans).where(eq(plans.code, targetPlanCode));
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.customerId, customerId));
    const currentPlan = await tx.query.plans.findFirst({ where: eq(plans.id, sub.planId) });
    const isUpgrade = targetPlan.tier > (currentPlan?.tier ?? 0);

    if (isUpgrade) {
      await tx
        .update(subscriptions)
        .set({ planId: targetPlan.id, pendingPlanId: null, status: 'active', changesThisCycle: sub.changesThisCycle + 1 })
        .where(eq(subscriptions.id, sub.id));
    } else {
      await tx
        .update(subscriptions)
        .set({ pendingPlanId: targetPlan.id, status: 'pending_change', changesThisCycle: sub.changesThisCycle + 1 })
        .where(eq(subscriptions.id, sub.id));
    }

    return { subscriptionId: sub.id };
  },
  sensor: (args, ctx, result) => subscriptionMatchesPlan(args, ctx, result),
});
