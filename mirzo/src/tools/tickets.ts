import { createTool } from '@mastra/core/tools';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logAudit } from '../db/audit.js';
import { db } from '../db/client.js';
import { subscriptions, tickets } from '../db/schema.js';
import { createGuardedTool } from '../guard/createGuardedTool.js';
import { escalationTicketOpen } from '../sensors/index.js';
import { traceId } from './context.js';

// --------------------------------------------------------- unguarded writes -

// SPEC.md §5.3
export const createTicket = createTool({
  id: 'createTicket',
  description: 'Create an escalation ticket for a human agent to follow up on.',
  inputSchema: z.object({
    customerId: z.string().uuid(),
    category: z.enum(['billing', 'technical', 'retention', 'authorization']),
    summary: z.string(),
  }),
  execute: async ({ customerId, category, summary }, ctx) => {
    const [ticket] = await db.insert(tickets).values({ customerId, category, summary, status: 'open' }).returning();
    const result = { ticketId: ticket.id };

    await logAudit({ traceId: traceId(ctx), customerId, toolName: 'createTicket', outcome: 'committed', args: { customerId, category, summary }, result });
    return result;
  },
});

// SPEC.md §5.3, §8.3 — sets the flag requestCancellation reads. This is how
// the retention ladder is enforced in code, not by prompt compliance.
export const setRetentionAttempted = createTool({
  id: 'setRetentionAttempted',
  description: 'Mark that a retention offer has been made to a customer during a cancellation conversation.',
  inputSchema: z.object({ customerId: z.string().uuid() }),
  execute: async ({ customerId }, ctx) => {
    await db.update(subscriptions).set({ retentionAttempted: true }).where(eq(subscriptions.customerId, customerId));
    const result = { ok: true };

    await logAudit({ traceId: traceId(ctx), customerId, toolName: 'setRetentionAttempted', outcome: 'committed', args: { customerId }, result });
    return result;
  },
});

// ----------------------------------------------------------- guarded tool --

// SPEC.md §5.2, §8.3, §14 — requestCancellation never cancels the
// subscription itself; it always ends in a human escalation ticket.
export const requestCancellation = createGuardedTool({
  name: 'requestCancellation',
  description: 'Propose (then, with a token, commit) escalating a cancellation request to a human agent. Requires a retention offer to have been made first.',
  schema: z.object({ customerId: z.string().uuid() }),
  preconditions: async ({ customerId }) => {
    const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.customerId, customerId) });
    if (!sub) {
      return { ok: false, code: 'NO_SUBSCRIPTION', message: 'No active subscription found for this customer.' };
    }
    if (!sub.retentionAttempted) {
      return { ok: false, code: 'RETENTION_REQUIRED', message: 'A retention offer must be made before escalating a cancellation.' };
    }
    return { ok: true };
  },
  summarize: () => 'Escalate this cancellation to a specialist',
  commit: async ({ customerId }, _ctx, tx) => {
    const [ticket] = await tx
      .insert(tickets)
      .values({
        customerId,
        category: 'retention',
        summary: 'Cancellation requested; retention ladder completed. Customer wants to proceed — needs human finalisation.',
        status: 'open',
      })
      .returning();
    return { ticketId: ticket.id };
  },
  sensor: (args, ctx, result) => escalationTicketOpen(args, ctx, result),
});
