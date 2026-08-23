import { relations } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------- enums ---

export const customerLanguage = pgEnum('customer_language', ['uz', 'en']);
export const customerStatus = pgEnum('customer_status', ['active', 'suspended', 'cancelled']);
export const subscriptionStatus = pgEnum('subscription_status', ['active', 'pending_change']);
export const customerAddonStatus = pgEnum('customer_addon_status', ['active', 'cancelled']);
export const transactionType = pgEnum('transaction_type', ['charge', 'credit', 'payment', 'addon']);
export const auditOutcome = pgEnum('audit_outcome', [
  'read',
  'proposed',
  'committed',
  'verified',
  'rejected',
  'verify_failed',
]);
export const ticketCategory = pgEnum('ticket_category', [
  'billing',
  'technical',
  'retention',
  'authorization',
]);
export const ticketStatus = pgEnum('ticket_status', ['open', 'closed']);

// --------------------------------------------------------------- tables ---
// SPEC.md §4

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull(),
  language: customerLanguage('language').notNull(),
  status: customerStatus('status').notNull().default('active'),
  balance: numeric('balance', { precision: 10, scale: 2 }).notNull().default('0'),
  tenureMonths: integer('tenure_months').notNull().default(0),
});

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  dataGb: integer('data_gb').notNull(),
  minutes: integer('minutes').notNull(),
  sms: integer('sms').notNull(),
  tier: integer('tier').notNull(),
  active: boolean('active').notNull().default(true),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  pendingPlanId: uuid('pending_plan_id').references(() => plans.id),
  cycleStart: date('cycle_start').notNull(),
  cycleEnd: date('cycle_end').notNull(),
  status: subscriptionStatus('status').notNull().default('active'),
  changesThisCycle: integer('changes_this_cycle').notNull().default(0),
  retentionAttempted: boolean('retention_attempted').notNull().default(false),
});

export const addons = pgTable('addons', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  active: boolean('active').notNull().default(true),
});

export const customerAddons = pgTable('customer_addons', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  addonId: uuid('addon_id').notNull().references(() => addons.id),
  status: customerAddonStatus('status').notNull().default('active'),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usage = pgTable('usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id),
  dataUsedGb: numeric('data_used_gb', { precision: 6, scale: 2 }).notNull().default('0'),
  minutesUsed: integer('minutes_used').notNull().default(0),
  smsUsed: integer('sms_used').notNull().default(0),
  cycleStart: date('cycle_start').notNull(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  type: transactionType('type').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description').notNull(),
  invoiceMonth: date('invoice_month').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const outages = pgTable('outages', {
  id: uuid('id').primaryKey().defaultRandom(),
  region: text('region').notNull(),
  active: boolean('active').notNull().default(false),
  eta: timestamp('eta', { withTimezone: true }),
});

export const pendingActions = pgTable('pending_actions', {
  token: uuid('token').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  toolName: text('tool_name').notNull(),
  argsHash: text('args_hash').notNull(),
  argsSnapshot: jsonb('args_snapshot').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
});

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  traceId: uuid('trace_id').notNull(),
  customerId: uuid('customer_id'),
  toolName: text('tool_name').notNull(),
  outcome: auditOutcome('outcome').notNull(),
  args: jsonb('args'),
  result: jsonb('result'),
  rejectReason: text('reject_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  category: ticketCategory('category').notNull(),
  summary: text('summary').notNull(),
  status: ticketStatus('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').primaryKey(),
  toolName: text('tool_name').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const telegramLinks = pgTable('telegram_links', {
  telegramUserId: text('telegram_user_id').primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
});

// ------------------------------------------------------------- relations ---
// Enough to support the db.query.*.findFirst({ with: {...} }) patterns used
// by tools and sensors (SPEC.md §7).

export const customersRelations = relations(customers, ({ many }) => ({
  subscriptions: many(subscriptions),
  transactions: many(transactions),
  customerAddons: many(customerAddons),
  tickets: many(tickets),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  customer: one(customers, { fields: [subscriptions.customerId], references: [customers.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  pendingPlan: one(plans, { fields: [subscriptions.pendingPlanId], references: [plans.id] }),
}));

export const customerAddonsRelations = relations(customerAddons, ({ one }) => ({
  customer: one(customers, { fields: [customerAddons.customerId], references: [customers.id] }),
  addon: one(addons, { fields: [customerAddons.addonId], references: [addons.id] }),
}));

export const usageRelations = relations(usage, ({ one }) => ({
  subscription: one(subscriptions, { fields: [usage.subscriptionId], references: [subscriptions.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  customer: one(customers, { fields: [transactions.customerId], references: [customers.id] }),
}));

export const pendingActionsRelations = relations(pendingActions, ({ one }) => ({
  customer: one(customers, { fields: [pendingActions.customerId], references: [customers.id] }),
}));

export const ticketsRelations = relations(tickets, ({ one }) => ({
  customer: one(customers, { fields: [tickets.customerId], references: [customers.id] }),
}));

export const telegramLinksRelations = relations(telegramLinks, ({ one }) => ({
  customer: one(customers, { fields: [telegramLinks.customerId], references: [customers.id] }),
}));
