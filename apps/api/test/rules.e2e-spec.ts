import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '../src/db/database.module.js';
import { payments, subscriptions } from '../src/db/schema.js';
import { AccountService } from '../src/streambox/account.service.js';
import { PolicyService, chunkPolicy } from '../src/streambox/policy.service.js';
import { RefundService } from '../src/streambox/refund.service.js';
import { SubscriptionService } from '../src/streambox/subscription.service.js';
import * as schema from '../src/db/schema.js';
import { CUSTOMER, createTestApp } from './setup.js';

// Business rules against the real database. No model involved: these rules
// must hold whatever the agent says.
describe('StreamBox rules (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let reseed: () => Promise<unknown>;
  let account: AccountService;
  let refunds: RefundService;
  let subs: SubscriptionService;

  beforeAll(async () => {
    ({ app, db, reseed } = await createTestApp());
    account = app.get(AccountService);
    refunds = app.get(RefundService);
    subs = app.get(SubscriptionService);
  });
  beforeEach(() => reseed());
  afterAll(() => app.close());

  const latestPayment = async (customerId: number) => (await account.listPayments(customerId, 1))[0];
  const paymentStatus = async (id: number) =>
    (await db.select().from(payments).where(eq(payments.id, id)))[0].status;
  const subscription = async (customerId: number) =>
    (await db.select().from(subscriptions).where(eq(subscriptions.customerId, customerId)))[0];

  describe('refunds', () => {
    it('refunds a small charge inside the 7-day window automatically', async () => {
      const payment = await latestPayment(CUSTOMER.alice);
      const result = await refunds.request(CUSTOMER.alice, payment.payment_id, 'changed my mind');

      expect(result).toMatchObject({ outcome: 'refunded', amount_cents: 1599, rule: 'within_window' });
      expect(await paymentStatus(payment.payment_id)).toBe('refunded');
    });

    it('sends a refund above the threshold for human approval without refunding', async () => {
      const payment = await latestPayment(CUSTOMER.bruno);
      const result = await refunds.request(CUSTOMER.bruno, payment.payment_id, 'too expensive');

      expect(result).toMatchObject({ outcome: 'pending_approval', amount_cents: 22990 });
      expect(await paymentStatus(payment.payment_id)).toBe('succeeded');
    });

    it('denies a charge outside the window', async () => {
      const payment = await latestPayment(CUSTOMER.carla);
      const result = await refunds.request(CUSTOMER.carla, payment.payment_id, 'please');

      expect(result.outcome).toBe('denied');
      expect(await paymentStatus(payment.payment_id)).toBe('succeeded');
    });

    it('refunds a duplicate charge even after the window', async () => {
      const payment = await latestPayment(CUSTOMER.david);
      expect(payment.possible_duplicate).toBe(true);
      const result = await refunds.request(CUSTOMER.david, payment.payment_id, 'charged twice');

      expect(result).toMatchObject({ outcome: 'refunded', rule: 'duplicate_charge' });
    });

    it('does not refund the same payment twice', async () => {
      const payment = await latestPayment(CUSTOMER.alice);
      await refunds.request(CUSTOMER.alice, payment.payment_id, 'first');
      const again = await refunds.request(CUSTOMER.alice, payment.payment_id, 'second');

      expect(again.outcome).toBe('denied');
    });

    it("cannot touch another customer's payment", async () => {
      const alicePayment = await latestPayment(CUSTOMER.alice);
      await expect(
        refunds.request(CUSTOMER.carla, alicePayment.payment_id, 'not mine'),
      ).rejects.toThrow('Payment not found');
      expect(await paymentStatus(alicePayment.payment_id)).toBe('succeeded');
    });

    it('refunds only after a human approves, and records who decided', async () => {
      const payment = await latestPayment(CUSTOMER.bruno);
      const pending = await refunds.request(CUSTOMER.bruno, payment.payment_id, 'too expensive');
      if (pending.outcome !== 'pending_approval') throw new Error('expected pending approval');

      const decided = await refunds.decide(pending.refund_id, 'approve', 'maria');
      expect(decided).toMatchObject({ status: 'refunded', decidedBy: 'maria' });
      expect(await paymentStatus(payment.payment_id)).toBe('refunded');
      await expect(refunds.decide(pending.refund_id, 'reject', 'joao')).rejects.toThrow('already');
    });

    it('keeps the payment when a human rejects the refund', async () => {
      const payment = await latestPayment(CUSTOMER.bruno);
      const pending = await refunds.request(CUSTOMER.bruno, payment.payment_id, 'too expensive');
      if (pending.outcome !== 'pending_approval') throw new Error('expected pending approval');

      await refunds.decide(pending.refund_id, 'reject', 'maria');
      expect(await paymentStatus(payment.payment_id)).toBe('succeeded');
    });
  });

  describe('plan changes', () => {
    it('applies an upgrade now and charges the prorated difference', async () => {
      // Alice: Standard monthly ($15.99), 1 day into a 30-day period.
      const result = await subs.changePlan(CUSTOMER.alice, 'premium_monthly');

      expect(result).toMatchObject({ outcome: 'applied', to_plan: 'premium_monthly' });
      expect(result.outcome === 'applied' && result.charged_now_cents).toBe(Math.round(700 * (29 / 30)));
      expect((await subscription(CUSTOMER.alice)).planId).toBe(5);
    });

    it('schedules a downgrade for the next cycle and keeps the current plan', async () => {
      const result = await subs.changePlan(CUSTOMER.alice, 'basic_monthly');

      expect(result.outcome).toBe('scheduled');
      const sub = await subscription(CUSTOMER.alice);
      expect(sub.planId).toBe(3);
      expect(sub.pendingPlanId).toBe(1);
    });

    it('refuses plan changes on a suspended subscription and unknown plans', async () => {
      await expect(subs.changePlan(CUSTOMER.elena, 'basic_monthly')).rejects.toThrow('active');
      await expect(subs.changePlan(CUSTOMER.alice, 'platinum')).rejects.toThrow('Unknown plan');
    });
  });

  describe('cancellation', () => {
    it('keeps access until the period ends', async () => {
      const result = await subs.cancel(CUSTOMER.alice);

      expect(result.outcome).toBe('scheduled');
      const sub = await subscription(CUSTOMER.alice);
      expect(sub.status).toBe('active');
      expect(sub.cancelAtPeriodEnd).toBe(true);
    });

    it('ends a suspended subscription immediately', async () => {
      expect((await subs.cancel(CUSTOMER.elena)).outcome).toBe('canceled_now');
      expect((await subscription(CUSTOMER.elena)).status).toBe('canceled');
    });

    it('reports a customer without a subscription as an expected error', async () => {
      await expect(subs.cancel(CUSTOMER.ines)).rejects.toThrow('no subscription');
    });
  });

  describe('policy search', () => {
    beforeAll(async () => {
      await db.delete(schema.policyChunks);
      await db.insert(schema.policyChunks).values([
        ...chunkPolicy('refunds.md', '# Refund policy\n\n## Duplicate charges\nIf you were charged twice, the extra charge is refunded.\n\n## The 7-day window\nFull refund within 7 days.'),
        ...chunkPolicy('plans.md', '# Plans\n\n## Downgrades\nA downgrade takes effect at the next billing period.'),
      ]);
    });

    it('returns the most relevant section first', async () => {
      const [first] = await app.get(PolicyService).search('charged twice duplicate');
      expect(first.heading).toBe('Refund policy: Duplicate charges');
    });

    it('returns nothing for unrelated or empty queries', async () => {
      expect(await app.get(PolicyService).search('zebra')).toEqual([]);
      expect(await app.get(PolicyService).search('!!!')).toEqual([]);
    });
  });
});
