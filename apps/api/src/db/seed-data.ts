/**
 * Sample data for StreamBox.
 *
 * Every customer exists to exercise one scenario the agent must handle
 * (refund allowed, refund denied, needs human approval, suspended...).
 * All dates are relative to `now`, so "charged yesterday" stays true whenever
 * the seed runs, and tests can pass a fixed date for deterministic results.
 */
import type {
  customers,
  payments,
  plans,
  subscriptions,
} from './schema.js';

type NewPlan = typeof plans.$inferInsert;
type NewCustomer = typeof customers.$inferInsert;
type NewSubscription = typeof subscriptions.$inferInsert;
type NewPayment = typeof payments.$inferInsert;

export interface SeedData {
  plans: NewPlan[];
  customers: NewCustomer[];
  subscriptions: NewSubscription[];
  payments: NewPayment[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = { monthly: 30, yearly: 365 } as const;

export const PLANS = [
  { id: 1, code: 'basic_monthly', name: 'Basic (monthly)', tier: 'basic', billingInterval: 'monthly', priceCents: 999, maxScreens: 1, offlineDownloads: false },
  { id: 2, code: 'basic_yearly', name: 'Basic (yearly)', tier: 'basic', billingInterval: 'yearly', priceCents: 9990, maxScreens: 1, offlineDownloads: false },
  { id: 3, code: 'standard_monthly', name: 'Standard (monthly)', tier: 'standard', billingInterval: 'monthly', priceCents: 1599, maxScreens: 2, offlineDownloads: true },
  { id: 4, code: 'standard_yearly', name: 'Standard (yearly)', tier: 'standard', billingInterval: 'yearly', priceCents: 15990, maxScreens: 2, offlineDownloads: true },
  { id: 5, code: 'premium_monthly', name: 'Premium (monthly)', tier: 'premium', billingInterval: 'monthly', priceCents: 2299, maxScreens: 4, offlineDownloads: true },
  { id: 6, code: 'premium_yearly', name: 'Premium (yearly)', tier: 'premium', billingInterval: 'yearly', priceCents: 22990, maxScreens: 4, offlineDownloads: true },
] as const satisfies NewPlan[];

type PlanCode = (typeof PLANS)[number]['code'];

interface Charge {
  daysAgo: number;
  status: NewPayment['status'];
  failureReason?: string;
}

interface Persona {
  name: string;
  email: string;
  /** What this customer is for. Shown in docs, not stored. */
  scenario: string;
  subscription?: {
    plan: PlanCode;
    status: NewSubscription['status'];
    /** Days since the current period started. */
    periodStartedDaysAgo: number;
    cancelAtPeriodEnd?: boolean;
    canceledDaysAgo?: number;
    pendingPlan?: PlanCode;
    charges: Charge[];
  };
}

export const PERSONAS: Persona[] = [
  {
    name: 'Alice Martin',
    email: 'alice@example.com',
    scenario: 'Charged yesterday: refund is inside the 7-day window and below the approval threshold.',
    subscription: {
      plan: 'standard_monthly',
      status: 'active',
      periodStartedDaysAgo: 1,
      charges: [
        { daysAgo: 31, status: 'succeeded' },
        { daysAgo: 1, status: 'succeeded' },
      ],
    },
  },
  {
    name: 'Bruno Costa',
    email: 'bruno@example.com',
    scenario: 'Yearly Premium charged 3 days ago: refund is in the window but above the threshold, so it needs human approval.',
    subscription: {
      plan: 'premium_yearly',
      status: 'active',
      periodStartedDaysAgo: 3,
      charges: [{ daysAgo: 3, status: 'succeeded' }],
    },
  },
  {
    name: 'Carla Nguyen',
    email: 'carla@example.com',
    scenario: 'Charged 20 days ago: refund is outside the 7-day window and must be denied.',
    subscription: {
      plan: 'basic_monthly',
      status: 'active',
      periodStartedDaysAgo: 20,
      charges: [
        { daysAgo: 50, status: 'succeeded' },
        { daysAgo: 20, status: 'succeeded' },
      ],
    },
  },
  {
    name: 'David Okafor',
    email: 'david@example.com',
    scenario: 'Charged twice on the same day 10 days ago: duplicate charge is an exception to the 7-day rule.',
    subscription: {
      plan: 'standard_monthly',
      status: 'active',
      periodStartedDaysAgo: 10,
      charges: [
        { daysAgo: 10, status: 'succeeded' },
        { daysAgo: 10, status: 'succeeded' },
      ],
    },
  },
  {
    name: 'Elena Petrova',
    email: 'elena@example.com',
    scenario: 'Three failed charges: subscription is suspended.',
    subscription: {
      plan: 'premium_monthly',
      status: 'suspended',
      periodStartedDaysAgo: 37,
      charges: [
        { daysAgo: 37, status: 'succeeded' },
        { daysAgo: 7, status: 'failed', failureReason: 'card_declined' },
        { daysAgo: 5, status: 'failed', failureReason: 'card_declined' },
        { daysAgo: 3, status: 'failed', failureReason: 'card_declined' },
      ],
    },
  },
  {
    name: 'Felipe Souza',
    email: 'felipe@example.com',
    scenario: 'Asked to cancel 2 days ago: still has access until the period ends.',
    subscription: {
      plan: 'standard_monthly',
      status: 'active',
      periodStartedDaysAgo: 15,
      cancelAtPeriodEnd: true,
      canceledDaysAgo: 2,
      charges: [{ daysAgo: 15, status: 'succeeded' }],
    },
  },
  {
    name: 'Grace Kim',
    email: 'grace@example.com',
    scenario: 'Canceled and the paid period is over: no access.',
    subscription: {
      plan: 'basic_monthly',
      status: 'canceled',
      periodStartedDaysAgo: 70,
      canceledDaysAgo: 45,
      charges: [{ daysAgo: 70, status: 'succeeded' }],
    },
  },
  {
    name: 'Hiro Tanaka',
    email: 'hiro@example.com',
    scenario: 'Scheduled a downgrade from Premium to Basic: it applies on the next cycle.',
    subscription: {
      plan: 'premium_monthly',
      status: 'active',
      periodStartedDaysAgo: 12,
      pendingPlan: 'basic_monthly',
      charges: [{ daysAgo: 12, status: 'succeeded' }],
    },
  },
  {
    name: 'Ines Duarte',
    email: 'ines@example.com',
    scenario: 'Registered but never subscribed.',
  },
  {
    name: 'Jonas Weber',
    email: 'jonas@example.com',
    scenario: 'Long payment history, including one charge that was already refunded.',
    subscription: {
      plan: 'basic_monthly',
      status: 'active',
      periodStartedDaysAgo: 5,
      charges: [
        { daysAgo: 155, status: 'succeeded' },
        { daysAgo: 125, status: 'succeeded' },
        { daysAgo: 95, status: 'succeeded' },
        { daysAgo: 65, status: 'refunded' },
        { daysAgo: 35, status: 'succeeded' },
        { daysAgo: 5, status: 'succeeded' },
      ],
    },
  },
  {
    name: 'Kate Brown',
    email: 'kate@example.com',
    scenario: 'Renewal failed yesterday: past due, retries still pending.',
    subscription: {
      plan: 'standard_monthly',
      status: 'past_due',
      periodStartedDaysAgo: 31,
      charges: [
        { daysAgo: 31, status: 'succeeded' },
        { daysAgo: 1, status: 'failed', failureReason: 'insufficient_funds' },
      ],
    },
  },
];

export function buildSeedData(now: Date): SeedData {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const planByCode = new Map<PlanCode, (typeof PLANS)[number]>(
    PLANS.map((p) => [p.code, p]),
  );

  const data: SeedData = {
    plans: [...PLANS],
    customers: [],
    subscriptions: [],
    payments: [],
  };

  PERSONAS.forEach((persona, index) => {
    const customerId = index + 1;
    const sub = persona.subscription;
    const firstChargeDaysAgo = sub
      ? Math.max(...sub.charges.map((c) => c.daysAgo))
      : 0;

    data.customers.push({
      id: customerId,
      name: persona.name,
      email: persona.email,
      createdAt: daysAgo(firstChargeDaysAgo),
    });
    if (!sub) return;

    const plan = planByCode.get(sub.plan)!;
    const subscriptionId = data.subscriptions.length + 1;
    const periodStart = daysAgo(sub.periodStartedDaysAgo);

    data.subscriptions.push({
      id: subscriptionId,
      customerId,
      planId: plan.id,
      status: sub.status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: new Date(
        periodStart.getTime() + PERIOD_DAYS[plan.billingInterval] * DAY_MS,
      ),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
      pendingPlanId: sub.pendingPlan
        ? planByCode.get(sub.pendingPlan)!.id
        : null,
      canceledAt:
        sub.canceledDaysAgo === undefined ? null : daysAgo(sub.canceledDaysAgo),
      createdAt: daysAgo(firstChargeDaysAgo),
    });

    for (const charge of sub.charges) {
      data.payments.push({
        subscriptionId,
        amountCents: plan.priceCents,
        status: charge.status,
        failureReason: charge.failureReason ?? null,
        createdAt: daysAgo(charge.daysAgo),
      });
    }
  });

  return data;
}
