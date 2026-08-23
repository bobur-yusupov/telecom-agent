import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  addons,
  customerAddons,
  customers,
  outages,
  plans,
  subscriptions,
  transactions,
  usage,
} from '../db/schema.js';
import { addonSeeds, customerSeeds, outageSeeds, planSeeds } from './data.js';

async function reset() {
  await db.execute(sql`TRUNCATE TABLE
    customers, plans, subscriptions, addons, customer_addons, usage,
    transactions, outages, pending_actions, audit_log, tickets,
    idempotency_keys, telegram_links
    RESTART IDENTITY CASCADE`);

  const insertedPlans = await db.insert(plans).values(planSeeds).returning();
  const planIdByCode = new Map(insertedPlans.map((p) => [p.code, p.id]));

  const insertedAddons = await db.insert(addons).values(addonSeeds).returning();
  const addonIdByCode = new Map(insertedAddons.map((a) => [a.code, a.id]));

  await db.insert(outages).values(
    outageSeeds.map((o) => ({
      region: o.region,
      active: o.active,
      eta: new Date(Date.now() + o.etaMinutesFromNow * 60_000),
    })),
  );

  for (const c of customerSeeds) {
    const [customer] = await db
      .insert(customers)
      .values({
        phone: c.phone,
        name: c.name,
        language: c.language,
        status: c.status,
        balance: c.balance,
        tenureMonths: c.tenureMonths,
      })
      .returning();

    const planId = planIdByCode.get(c.planCode);
    if (!planId) throw new Error(`seed: unknown plan code ${c.planCode}`);

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        customerId: customer.id,
        planId,
        cycleStart: c.cycleStart,
        cycleEnd: c.cycleEnd,
        changesThisCycle: c.changesThisCycle,
        retentionAttempted: c.retentionAttempted,
      })
      .returning();

    await db.insert(usage).values({
      subscriptionId: subscription.id,
      dataUsedGb: c.usage.dataUsedGb,
      minutesUsed: c.usage.minutesUsed,
      smsUsed: c.usage.smsUsed,
      cycleStart: c.usage.cycleStart,
    });

    for (const a of c.addons) {
      const addonId = addonIdByCode.get(a.addonCode);
      if (!addonId) throw new Error(`seed: unknown addon code ${a.addonCode}`);
      await db.insert(customerAddons).values({
        customerId: customer.id,
        addonId,
        status: 'active',
        activatedAt: new Date(a.activatedAt),
      });
    }

    if (c.transactions.length > 0) {
      await db.insert(transactions).values(
        c.transactions.map((t) => ({
          customerId: customer.id,
          type: t.type,
          amount: t.amount,
          description: t.description,
          invoiceMonth: t.invoiceMonth,
        })),
      );
    }
  }

  console.log(`[seed] reset complete: ${customerSeeds.length} customers, ${planSeeds.length} plans, ${addonSeeds.length} addons, ${outageSeeds.length} outage(s)`);
}

reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
