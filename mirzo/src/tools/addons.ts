import { createTool } from '@mastra/core/tools';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { logAudit } from '../db/audit.js';
import { db } from '../db/client.js';
import { addons, customerAddons, customers, transactions } from '../db/schema.js';
import { createGuardedTool } from '../guard/createGuardedTool.js';
import { addonActive } from '../sensors/index.js';
import { traceId } from './context.js';

// A customer already carrying this much outstanding balance can't add more
// charges until it comes down — the "balance sufficient" precondition (SPEC §5.2).
const MAX_BALANCE_FOR_ADDON_PURCHASE = 200;

// ------------------------------------------------------------- read tool ---

export const listAddons = createTool({
  id: 'listAddons',
  description: 'List available add-ons and which ones a customer currently has active.',
  inputSchema: z.object({ customerId: z.string().uuid() }),
  execute: async ({ customerId }, ctx) => {
    const catalog = await db.select().from(addons).where(eq(addons.active, true));
    const active = await db.query.customerAddons.findMany({
      where: and(eq(customerAddons.customerId, customerId), eq(customerAddons.status, 'active')),
      with: { addon: true },
    });
    const activeCodes = new Set(active.map((a) => a.addon.code));

    const result = {
      available: catalog.map((a) => ({ code: a.code, name: a.name, price: Number(a.price), active: activeCodes.has(a.code) })),
    };

    await logAudit({ traceId: traceId(ctx), customerId, toolName: 'listAddons', outcome: 'read', args: { customerId }, result });
    return result;
  },
});

// ----------------------------------------------------------- guarded tool --

// SPEC.md §5.2, §7 — purchaseAddon
export const purchaseAddon = createGuardedTool({
  name: 'purchaseAddon',
  description: 'Propose (then, with a token, commit) activating an add-on for a customer.',
  schema: z.object({
    customerId: z.string().uuid(),
    addonCode: z.string(),
  }),
  preconditions: async ({ customerId, addonCode }) => {
    const addon = await db.query.addons.findFirst({ where: eq(addons.code, addonCode) });
    if (!addon || !addon.active) {
      return { ok: false, code: 'ADDON_INACTIVE', message: 'That add-on is not currently available.' };
    }

    const customer = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
    if (!customer) {
      return { ok: false, code: 'NO_CUSTOMER', message: 'Customer not found.' };
    }
    if (Number(customer.balance) >= MAX_BALANCE_FOR_ADDON_PURCHASE) {
      return { ok: false, code: 'INSUFFICIENT_BALANCE', message: 'The outstanding balance is too high to add another charge right now.' };
    }

    const existing = await db.query.customerAddons.findFirst({
      where: and(eq(customerAddons.customerId, customerId), eq(customerAddons.addonId, addon.id), eq(customerAddons.status, 'active')),
    });
    if (existing) {
      return { ok: false, code: 'ADDON_ALREADY_ACTIVE', message: 'That add-on is already active for this customer.' };
    }

    return { ok: true };
  },
  summarize: ({ addonCode }) => `Activate add-on ${addonCode}`,
  commit: async ({ customerId, addonCode }, _ctx, tx) => {
    const [addon] = await tx.select().from(addons).where(eq(addons.code, addonCode));

    const [customerAddon] = await tx
      .insert(customerAddons)
      .values({ customerId, addonId: addon.id, status: 'active' })
      .returning();

    const now = new Date();
    await tx.insert(transactions).values({
      customerId,
      type: 'addon',
      amount: addon.price,
      description: `Add-on charge — ${addon.code}`,
      invoiceMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    });

    return { customerAddonId: customerAddon.id };
  },
  sensor: (args, ctx, result) => addonActive(args, ctx, result),
});
