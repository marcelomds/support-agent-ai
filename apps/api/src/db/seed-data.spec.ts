import { buildSeedData, PERSONAS } from './seed-data.js';

const NOW = new Date('2026-01-15T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('buildSeedData', () => {
  const data = buildSeedData(NOW);
  const customerId = (email: string) =>
    data.customers.find((c) => c.email === email)!.id!;
  const subscriptionOf = (email: string) =>
    data.subscriptions.find((s) => s.customerId === customerId(email));
  const paymentsOf = (email: string) =>
    data.payments.filter(
      (p) => p.subscriptionId === subscriptionOf(email)?.id,
    );

  it('creates one customer per persona', () => {
    expect(data.customers).toHaveLength(PERSONAS.length);
  });

  it('is deterministic for a fixed reference date', () => {
    expect(buildSeedData(NOW)).toEqual(data);
  });

  it('only references plans, customers and subscriptions that exist', () => {
    const planIds = new Set(data.plans.map((p) => p.id));
    const customerIds = new Set(data.customers.map((c) => c.id));
    const subscriptionIds = new Set(data.subscriptions.map((s) => s.id));
    for (const s of data.subscriptions) {
      expect(planIds.has(s.planId)).toBe(true);
      expect(customerIds.has(s.customerId)).toBe(true);
    }
    for (const p of data.payments) {
      expect(subscriptionIds.has(p.subscriptionId)).toBe(true);
    }
  });

  it('charges Alice yesterday, below the approval threshold', () => {
    const latest = paymentsOf('alice@example.com').at(-1)!;
    expect(NOW.getTime() - latest.createdAt!.getTime()).toBe(DAY_MS);
    expect(latest.amountCents).toBe(1599);
    expect(latest.status).toBe('succeeded');
  });

  it('charges Bruno the yearly Premium price 3 days ago', () => {
    const [payment] = paymentsOf('bruno@example.com');
    expect(payment.amountCents).toBe(22990);
    expect(NOW.getTime() - payment.createdAt!.getTime()).toBe(3 * DAY_MS);
  });

  it('gives David two successful charges at the same moment', () => {
    const charges = paymentsOf('david@example.com');
    expect(charges).toHaveLength(2);
    expect(charges[0].createdAt).toEqual(charges[1].createdAt);
  });

  it('suspends Elena after three failed charges', () => {
    expect(subscriptionOf('elena@example.com')!.status).toBe('suspended');
    expect(
      paymentsOf('elena@example.com').filter((p) => p.status === 'failed'),
    ).toHaveLength(3);
  });

  it('keeps Felipe active until the period ends after he cancels', () => {
    const sub = subscriptionOf('felipe@example.com')!;
    expect(sub.status).toBe('active');
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('schedules a downgrade for Hiro without changing the current plan', () => {
    const sub = subscriptionOf('hiro@example.com')!;
    const code = (id: number) => data.plans.find((p) => p.id === id)!.code;
    expect(code(sub.planId)).toBe('premium_monthly');
    expect(code(sub.pendingPlanId!)).toBe('basic_monthly');
  });

  it('leaves Ines without a subscription', () => {
    expect(subscriptionOf('ines@example.com')).toBeUndefined();
  });
});
