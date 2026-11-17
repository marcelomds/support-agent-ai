import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { ToolError } from '../agent/tool.js';
import { DB, type Database } from '../db/database.module.js';
import { payments, plans, subscriptions } from '../db/schema.js';
import {
  Clock,
  DAY_MS,
  DUPLICATE_CHARGE_WINDOW_HOURS,
  REFUND_WINDOW_DAYS,
} from './rules.js';

/** Read-only queries about one customer's account. */
@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /** The customer's most recent subscription, or undefined if they never had one. */
  async findSubscription(customerId: number) {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customerId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return subscription;
  }

  async requireSubscription(customerId: number) {
    const subscription = await this.findSubscription(customerId);
    if (!subscription) {
      throw new ToolError('This customer has no subscription.');
    }
    return subscription;
  }

  async listPlans() {
    return this.db.select().from(plans).orderBy(plans.id);
  }

  async findPlanByCode(code: string) {
    const [plan] = await this.db.select().from(plans).where(eq(plans.code, code));
    return plan;
  }

  async getSubscriptionSummary(customerId: number) {
    const subscription = await this.findSubscription(customerId);
    if (!subscription) return { has_subscription: false as const };

    const allPlans = await this.listPlans();
    const planOf = (id: number | null) => allPlans.find((p) => p.id === id);
    const plan = planOf(subscription.planId)!;
    const pendingPlan = planOf(subscription.pendingPlanId);

    return {
      has_subscription: true as const,
      status: subscription.status,
      plan: { code: plan.code, name: plan.name, price_cents: plan.priceCents },
      current_period_start: subscription.currentPeriodStart.toISOString(),
      current_period_end: subscription.currentPeriodEnd.toISOString(),
      cancel_at_period_end: subscription.cancelAtPeriodEnd,
      pending_downgrade_to: pendingPlan?.code ?? null,
    };
  }

  /** Recent charges, newest first, with refund eligibility already computed. */
  async listPayments(customerId: number, limit: number) {
    const subscription = await this.findSubscription(customerId);
    if (!subscription) return [];

    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.subscriptionId, subscription.id))
      .orderBy(desc(payments.createdAt), desc(payments.id));

    const now = this.clock.now().getTime();
    return rows.slice(0, limit).map((payment) => {
      const daysAgo = Math.floor((now - payment.createdAt.getTime()) / DAY_MS);
      return {
        payment_id: payment.id,
        amount_cents: payment.amountCents,
        status: payment.status,
        failure_reason: payment.failureReason,
        charged_at: payment.createdAt.toISOString(),
        // The model is bad at date arithmetic; give it the answer.
        days_ago: daysAgo,
        within_refund_window:
          payment.status === 'succeeded' && daysAgo <= REFUND_WINDOW_DAYS,
        possible_duplicate: isDuplicate(payment, rows),
      };
    });
  }
}

type PaymentRow = typeof payments.$inferSelect;

/** True when another successful charge of the same amount is within the duplicate window. */
export function isDuplicate(payment: PaymentRow, all: PaymentRow[]): boolean {
  if (payment.status !== 'succeeded') return false;
  const windowMs = DUPLICATE_CHARGE_WINDOW_HOURS * 60 * 60 * 1000;
  return all.some(
    (other) =>
      other.id !== payment.id &&
      other.status === 'succeeded' &&
      other.subscriptionId === payment.subscriptionId &&
      other.amountCents === payment.amountCents &&
      Math.abs(other.createdAt.getTime() - payment.createdAt.getTime()) <=
        windowMs,
  );
}
