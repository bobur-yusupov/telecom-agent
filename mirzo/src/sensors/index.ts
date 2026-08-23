import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { customerAddons, customers, plans, subscriptions, tickets, transactions } from '../db/schema.js';

// SPEC.md §7 — each sensor independently re-queries state after `commit`. It
// never trusts the transaction's own return value; only the return value's
// *ids* are used to know what to re-fetch.

export async function subscriptionMatchesPlan(
  args: { customerId: string; targetPlanCode: string },
  _ctx: unknown,
  result: { subscriptionId: string },
): Promise<boolean> {
  const targetPlan = await db.query.plans.findFirst({ where: eq(plans.code, args.targetPlanCode) });
  if (!targetPlan) return false;

  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, result.subscriptionId) });
  if (!sub) return false;

  const upgraded = sub.planId === targetPlan.id && sub.status === 'active';
  const downgradeScheduled = sub.pendingPlanId === targetPlan.id && sub.status === 'pending_change';
  return upgraded || downgradeScheduled;
}

export async function creditApplied(
  args: { customerId: string; amount: string },
  _ctx: unknown,
  result: { transactionId: string; newBalance: string },
): Promise<boolean> {
  const tx = await db.query.transactions.findFirst({ where: eq(transactions.id, result.transactionId) });
  if (!tx || tx.type !== 'credit') return false;
  if (Number(tx.amount) !== Number(args.amount)) return false;

  const customer = await db.query.customers.findFirst({ where: eq(customers.id, args.customerId) });
  if (!customer) return false;

  return Number(customer.balance) === Number(result.newBalance);
}

export async function addonActive(
  args: { customerId: string; addonCode: string },
  _ctx: unknown,
  _result: unknown,
): Promise<boolean> {
  const addon = await db.query.addons.findFirst({
    where: (a, { eq: eqFn }) => eqFn(a.code, args.addonCode),
  });
  if (!addon) return false;

  const row = await db.query.customerAddons.findFirst({
    where: and(
      eq(customerAddons.customerId, args.customerId),
      eq(customerAddons.addonId, addon.id),
      eq(customerAddons.status, 'active'),
    ),
  });
  return !!row;
}

export async function escalationTicketOpen(
  _args: { customerId: string },
  _ctx: unknown,
  result: { ticketId: string },
): Promise<boolean> {
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, result.ticketId) });
  return !!ticket && ticket.category === 'retention' && ticket.status === 'open';
}

export const sensors = {
  subscriptionMatchesPlan,
  creditApplied,
  addonActive,
  escalationTicketOpen,
};
