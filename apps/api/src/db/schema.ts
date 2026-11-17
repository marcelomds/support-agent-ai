/**
 * Database schema: the StreamBox domain plus the tables the agent needs.
 *
 * Conventions:
 * - Money is stored as integer cents (never floats) in a single currency (USD).
 * - Timestamps are `timestamptz`.
 * - Status columns are Postgres enums so invalid states cannot be stored.
 *
 * See docs/01-schema-and-tools.md for the reasoning behind each table.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
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

export const refundStatus = pgEnum('refund_status', [
  'pending_approval', // above the threshold, waiting for a human
  'refunded',
  'rejected',
]);

/** A refund request made through the agent, and what happened to it. */
export const refunds = pgTable(
  'refunds',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    paymentId: integer('payment_id')
      .notNull()
      .references(() => payments.id),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    amountCents: integer('amount_cents').notNull(),
    reason: text().notNull(),
    /** Which rule made the payment eligible: within_window or duplicate_charge. */
    rule: text().notNull(),
    status: refundStatus().notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('refunds_status_idx').on(t.status)],
);

/**
 * The model API is stateless: it remembers nothing between requests.
 * A conversation is the list of messages we store and send back every time.
 */
export const conversations = pgTable('conversations', {
  id: uuid().primaryKey().defaultRandom(),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable(
  'messages',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    role: text().notNull(), // 'user' | 'assistant'
    /** Exactly what is sent to the model: text, tool calls and tool results. */
    content: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('messages_conversation_id_idx').on(t.conversationId)],
);

/** Every tool call the agent makes and every human decision. Append-only. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    customerId: integer('customer_id'),
    conversationId: uuid('conversation_id'),
    actor: text().notNull(), // 'agent' | 'human'
    action: text().notNull(), // tool name or human decision
    input: jsonb(),
    result: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('audit_log_customer_id_idx').on(t.customerId)],
);

/** Size of the vectors produced by the embedding model (multilingual-e5-small). */
export const EMBEDDING_DIMENSIONS = 384;

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

/** Policy documents split into sections, searchable by keyword and by meaning. */
export const policyChunks = pgTable(
  'policy_chunks',
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    document: text().notNull(), // source file, e.g. "refunds.md"
    heading: text().notNull(),
    content: text().notNull(),
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`to_tsvector('english', heading || ' ' || content)`,
    ),
    /**
     * The section's meaning as a list of numbers (an embedding). Two texts
     * about the same subject get vectors that point in a similar direction,
     * even when they share no words. Null until the section is embedded.
     */
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
  },
  (t) => [
    index('policy_chunks_search_idx').using('gin', t.searchVector),
    index('policy_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
