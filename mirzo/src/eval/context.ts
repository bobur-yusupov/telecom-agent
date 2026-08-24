import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createRequestContext } from '../agent/requestContext.js';
import { db } from '../db/client.js';
import { customers, plans, subscriptions, usage as usageTable } from '../db/schema.js';

// Every check gets its own throwaway customer, so checks never collide with
// each other or with the demo seed data. Requires `npm run seed` to have run
// at least once (needs the plan catalog).
export async function testCustomer(
  opts: {
    planCode?: string;
    tenureMonths?: number;
    dataUsedGb?: string;
    language?: 'uz' | 'en';
  } = {},
) {
  const plan = await db.query.plans.findFirst({ where: eq(plans.code, opts.planCode ?? 'NOVA_PLUS') });
  if (!plan) throw new Error('eval: run `npm run seed` first — no plans found');

  const [customer] = await db
    .insert(customers)
    .values({
      phone: `+992${crypto.randomInt(100000000, 999999999)}`,
      name: 'Eval Customer',
      language: opts.language ?? 'en',
      status: 'active',
      balance: '0.00',
      tenureMonths: opts.tenureMonths ?? 5,
    })
    .returning();

  const [subscription] = await db
    .insert(subscriptions)
    .values({ customerId: customer.id, planId: plan.id, cycleStart: '2026-08-01', cycleEnd: '2026-08-31' })
    .returning();

  await db.insert(usageTable).values({
    subscriptionId: subscription.id,
    dataUsedGb: opts.dataUsedGb ?? '2.00',
    minutesUsed: 50,
    smsUsed: 10,
    cycleStart: '2026-08-01',
  });

  return customer;
}

export function requestContextFor(customerId: string, extra: Record<string, unknown> = {}) {
  return createRequestContext({ customerId, ...extra });
}
