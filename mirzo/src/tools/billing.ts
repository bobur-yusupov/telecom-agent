import { createTool } from '@mastra/core/tools';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { logAudit } from '../db/audit.js';
import { db } from '../db/client.js';
import { customers, subscriptions, transactions } from '../db/schema.js';
import { creditApplied } from '../sensors/index.js';
import { sessionCustomerId, traceId } from './context.js';
import { createGuardedTool } from '../guard/createGuardedTool.js';

const MAX_CREDIT_PER_CALL = 50;
const MAX_CREDIT_PER_30_DAYS = 100;

// ------------------------------------------------------------ read tools ---

export const getBalance = createTool({
  id: 'getBalance',
  description: 'Get a customer’s current balance, due date, and whether it is overdue.',
  inputSchema: z.object({ customerId: z.string().uuid() }),
  execute: async ({ customerId }, ctx) => {
    const customer = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
    if (!customer) {
      const result = { found: false as const };
      await logAudit({ traceId: traceId(ctx), customerId, toolName: 'getBalance', outcome: 'read', args: { customerId }, result });
      return result;
    }
    const subscription = await db.query.subscriptions.findFirst({ where: eq(subscriptions.customerId, customerId) });
    const dueDate = subscription?.cycleEnd ?? null;
    const overdue = Number(customer.balance) > 0 && !!dueDate && new Date(dueDate) < new Date();
    const result = { found: true as const, balance: Number(customer.balance), dueDate, overdue };

    await logAudit({ traceId: traceId(ctx), customerId, toolName: 'getBalance', outcome: 'read', args: { customerId }, result });
    return result;
  },
});

export const getInvoice = createTool({
  id: 'getInvoice',
  description: 'Get the line items on a customer’s invoice for a given month (YYYY-MM).',
  inputSchema: z.object({ customerId: z.string().uuid(), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  execute: async ({ customerId, month }, ctx) => {
    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.customerId, customerId), sql`to_char(${transactions.invoiceMonth}, 'YYYY-MM') = ${month}`));
    const result = { month, lineItems: rows.map((r) => ({ type: r.type, amount: Number(r.amount), description: r.description })) };

    await logAudit({ traceId: traceId(ctx), customerId, toolName: 'getInvoice', outcome: 'read', args: { customerId, month }, result });
    return result;
  },
});

export const getTransactionHistory = createTool({
  id: 'getTransactionHistory',
  description: 'Get a customer’s most recent transactions.',
  inputSchema: z.object({ customerId: z.string().uuid(), limit: z.number().int().positive().max(100).default(10) }),
  execute: async ({ customerId, limit }, ctx) => {
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.customerId, customerId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
    const result = {
      transactions: rows.map((r) => ({
        type: r.type,
        amount: Number(r.amount),
        description: r.description,
        invoiceMonth: r.invoiceMonth,
        createdAt: r.createdAt,
      })),
    };

    await logAudit({ traceId: traceId(ctx), customerId, toolName: 'getTransactionHistory', outcome: 'read', args: { customerId, limit }, result });
    return result;
  },
});

export const compareInvoices = createTool({
  id: 'compareInvoices',
  description: 'Compare two months of a customer’s invoices (YYYY-MM each) and return the line-item delta. Required before proposing any credit (SPEC §8.1).',
  inputSchema: z.object({ customerId: z.string().uuid(), monthA: z.string().regex(/^\d{4}-\d{2}$/), monthB: z.string().regex(/^\d{4}-\d{2}$/) }),
  execute: async ({ customerId, monthA, monthB }, ctx) => {
    const fetchMonth = async (month: string) =>
      db
        .select()
        .from(transactions)
        .where(and(eq(transactions.customerId, customerId), sql`to_char(${transactions.invoiceMonth}, 'YYYY-MM') = ${month}`));

    const [rowsA, rowsB] = await Promise.all([fetchMonth(monthA), fetchMonth(monthB)]);
    const totalA = rowsA.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalB = rowsB.reduce((sum, r) => sum + Number(r.amount), 0);

    const result = {
      monthA: { month: monthA, total: totalA, lineItems: rowsA.map((r) => ({ type: r.type, amount: Number(r.amount), description: r.description })) },
      monthB: { month: monthB, total: totalB, lineItems: rowsB.map((r) => ({ type: r.type, amount: Number(r.amount), description: r.description })) },
      delta: totalB - totalA,
    };

    await logAudit({ traceId: traceId(ctx), customerId, toolName: 'compareInvoices', outcome: 'read', args: { customerId, monthA, monthB }, result });
    return result;
  },
});

// ----------------------------------------------------------- guarded tool --

// SPEC.md §5.2, §7 — applyCredit
export const applyCredit = createGuardedTool({
  name: 'applyCredit',
  description: 'Propose (then, with a token, commit) a credit to a customer’s balance for a specific disputed or goodwill amount. Requires an existing transaction to reference (SPEC §8.1: never credit without naming the line item and amount).',
  schema: z.object({
    customerId: z.string().uuid(),
    referenceTransactionId: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.string(),
  }),
  preconditions: async ({ customerId, referenceTransactionId, amount }) => {
    if (amount > MAX_CREDIT_PER_CALL) {
      return { ok: false, code: 'CREDIT_LIMIT_EXCEEDED', message: `Credits are capped at ${MAX_CREDIT_PER_CALL} TJS per action.` };
    }

    const reference = await db.query.transactions.findFirst({ where: eq(transactions.id, referenceTransactionId) });
    if (!reference || reference.customerId !== customerId) {
      return { ok: false, code: 'REFERENCE_NOT_FOUND', message: 'The referenced transaction does not exist for this customer.' };
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentCredits = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.customerId, customerId), eq(transactions.type, 'credit'), gte(transactions.createdAt, thirtyDaysAgo)));
    const recentTotal = recentCredits.reduce((sum, r) => sum + Number(r.amount), 0);
    if (recentTotal + amount > MAX_CREDIT_PER_30_DAYS) {
      return { ok: false, code: 'CREDIT_LIMIT_EXCEEDED', message: `This customer has reached the ${MAX_CREDIT_PER_30_DAYS} TJS / 30-day credit limit.` };
    }

    return { ok: true };
  },
  summarize: ({ amount, reason }) => `Apply a ${amount} TJS credit: ${reason}`,
  commit: async ({ customerId, amount }, _ctx, tx) => {
    const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId));
    const newBalance = (Number(customer.balance) - amount).toFixed(2);
    await tx.update(customers).set({ balance: newBalance }).where(eq(customers.id, customerId));

    const now = new Date();
    const [creditTx] = await tx
      .insert(transactions)
      .values({
        customerId,
        type: 'credit',
        amount: amount.toFixed(2),
        description: `Credit applied`,
        invoiceMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
      })
      .returning();

    return { transactionId: creditTx.id, newBalance };
  },
  sensor: async (args, ctx, result) => creditApplied({ customerId: args.customerId, amount: args.amount.toFixed(2) }, ctx, result),
});
