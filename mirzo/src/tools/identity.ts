import { createTool } from '@mastra/core/tools';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logAudit } from '../db/audit.js';
import { db } from '../db/client.js';
import { customers, telegramLinks } from '../db/schema.js';
import { sessionCustomerId, traceId } from './context.js';

// SPEC.md §5.1 — read tool.
export const lookupCustomer = createTool({
  id: 'lookupCustomer',
  description: 'Look up a customer by phone number. Use this to identify a customer at the start of a conversation.',
  inputSchema: z.object({ phone: z.string() }),
  execute: async ({ phone }, ctx) => {
    const customer = await db.query.customers.findFirst({ where: eq(customers.phone, phone) });
    const result = customer
      ? {
          found: true as const,
          id: customer.id,
          name: customer.name,
          status: customer.status,
          language: customer.language,
          tenureMonths: customer.tenureMonths,
        }
      : { found: false as const };

    await logAudit({
      traceId: traceId(ctx),
      customerId: customer?.id ?? sessionCustomerId(ctx),
      toolName: 'lookupCustomer',
      outcome: 'read',
      args: { phone },
      result,
    });
    return result;
  },
});

// SPEC.md §5.3, §14.6 — unguarded write. Persists the telegram_user_id →
// customer_id link so future turns skip the phone-number ask.
export const linkCustomer = createTool({
  id: 'linkCustomer',
  description:
    "Link the current Telegram user to a customer record after a successful lookupCustomer call, so future messages don't require re-identification.",
  inputSchema: z.object({
    telegramUserId: z.string(),
    customerId: z.string().uuid(),
  }),
  execute: async ({ telegramUserId, customerId }, ctx) => {
    await db
      .insert(telegramLinks)
      .values({ telegramUserId, customerId })
      .onConflictDoUpdate({ target: telegramLinks.telegramUserId, set: { customerId, linkedAt: new Date() } });

    // so a later tool call in this same turn already sees the resolved identity
    ctx.requestContext?.set?.('customerId', customerId);

    const result = { ok: true };
    await logAudit({
      traceId: traceId(ctx),
      customerId,
      toolName: 'linkCustomer',
      outcome: 'committed',
      args: { telegramUserId, customerId },
      result,
    });
    return result;
  },
});
