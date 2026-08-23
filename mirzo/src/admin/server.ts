import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client.js';
import { auditLog, customers, pendingActions, plans, subscriptions } from '../db/schema.js';

// SPEC.md §11 — read-only, no auth, 2s polling from the client.
const app = new Hono();

app.get('/api/audit', async (c) => {
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(50);
  return c.json(rows);
});

app.get('/api/pending', async (c) => {
  const rows = await db
    .select()
    .from(pendingActions)
    .where(and(isNull(pendingActions.consumedAt), gt(pendingActions.expiresAt, new Date())))
    .orderBy(pendingActions.expiresAt);
  return c.json(rows);
});

app.get('/api/customers', async (c) => {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      balance: customers.balance,
      status: customers.status,
      planName: plans.name,
      subscriptionStatus: subscriptions.status,
    })
    .from(customers)
    .leftJoin(subscriptions, eq(subscriptions.customerId, customers.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId));
  return c.json(rows);
});

app.use('/*', serveStatic({ root: './src/admin/public' }));

const port = Number(process.env.PORT ?? 3001);
export function startAdminServer() {
  serve({ fetch: app.fetch, port });
  console.log(`[admin] listening on :${port}`);
}
