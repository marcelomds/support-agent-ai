/**
 * Database schema for the StreamBox domain (phase 1).
 *
 * Conventions:
 * - Money is stored as integer cents (never floats) in a single currency (USD).
 * - Timestamps are `timestamptz`.
 * - Status columns are Postgres enums so invalid states cannot be stored.
 *
 * See docs/01-schema-and-tools.md for the reasoning behind each table.
 */
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const planTier = pgEnum('plan_tier', ['basic', 'standard', 'premium']);

export const billingInterval = pgEnum('billing_interval', [
  'monthly',
  'yearly',
]);

export const subscriptionStatus = pgEnum('subscription_status', [
  'active', // paid and in good standing
  'past_due', // last charge failed, retries still pending
  'suspended', // 3 failed charges, access blocked
  'canceled', // ended, no access
]);

export const paymentStatus = pgEnum('payment_status', [
  'succeeded',
  'failed',
  'refunded',
]);

/** Catalog of what can be bought. One row per tier + billing interval. */
export const plans = pgTable('plans', {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  code: text().notNull().unique(), // e.g. "standard_monthly"
  name: text().notNull(),
  tier: planTier().notNull(),
  billingInterval: billingInterval('billing_interval').notNull(),
  priceCents: integer('price_cents').notNull(),
  maxScreens: integer('max_screens').notNull(),
  offlineDownloads: boolean('offline_downloads').notNull().default(false),
});

export const customers = pgTable('customers', {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  name: text().notNull(),
  email: text().notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    planId: integer('plan_id')
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus().notNull(),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true,
    }).notNull(),
    /** Customer asked to cancel: access continues until the period ends. */
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    /** Scheduled downgrade: takes effect on the next billing cycle. */
    pendingPlanId: integer('pending_plan_id').references(() => plans.id),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('subscriptions_customer_id_idx').on(t.customerId)],
);

/** One row per charge attempt, successful or not. */
export const payments = pgTable(
  'payments',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    amountCents: integer('amount_cents').notNull(),
    status: paymentStatus().notNull(),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('payments_subscription_id_idx').on(t.subscriptionId)],
);

export type Plan = typeof plans.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
