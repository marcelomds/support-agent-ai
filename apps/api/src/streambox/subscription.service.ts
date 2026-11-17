import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ToolError } from '../agent/tool.js';
import { DB, type Database } from '../db/database.module.js';
import { payments, subscriptions } from '../db/schema.js';
import { AccountService } from './account.service.js';
import { Clock, DAY_MS, PERIOD_DAYS, TIER_RANK } from './rules.js';

/** Actions that change a subscription: plan changes and cancellation. */
@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly account: AccountService,
    private readonly clock: Clock,
  ) {}

  async changePlan(customerId: number, planCode: string) {
    const subscription = await this.account.requireSubscription(customerId);
    if (subscription.status !== 'active') {
      throw new ToolError(`Plan changes need an active subscription. Status: ${subscription.status}.`);
    }
    if (subscription.cancelAtPeriodEnd) {
      throw new ToolError('This subscription is set to cancel, so its plan cannot be changed.');
    }
    const allPlans = await this.account.listPlans();
    const current = allPlans.find((p) => p.id === subscription.planId)!;
    const target = allPlans.find((p) => p.code === planCode);
    if (!target) {
      throw new ToolError(`Unknown plan "${planCode}". Valid codes: ${allPlans.map((p) => p.code).join(', ')}.`);
    }
    if (target.id === current.id) throw new ToolError('The customer is already on this plan.');

    const now = this.clock.now();
    const sameInterval = target.billingInterval === current.billingInterval;
    const isUpgrade =
      TIER_RANK[target.tier] > TIER_RANK[current.tier] ||
      (target.tier === current.tier && target.billingInterval === 'yearly');

    if (!isUpgrade) {
      // Downgrade: the customer keeps what they paid for until the cycle ends.
      await this.db
        .update(subscriptions)
        .set({ pendingPlanId: target.id })
        .where(eq(subscriptions.id, subscription.id));
      return {
        outcome: 'scheduled' as const,
        from_plan: current.code,
        to_plan: target.code,
        effective_at: subscription.currentPeriodEnd.toISOString(),
        new_price_cents: target.priceCents,
      };
    }

    // Upgrade: applies now. Same interval charges the prorated difference for
    // the rest of the period; a new interval starts a new period at full price.
    const periodMs = subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime();
    const remaining = Math.max(0, subscription.currentPeriodEnd.getTime() - now.getTime()) / periodMs;
    const chargeCents = sameInterval
      ? Math.round((target.priceCents - current.priceCents) * remaining)
      : target.priceCents;

    return this.db.transaction(async (tx) => {
      await tx
        .update(subscriptions)
        .set({
          planId: target.id,
          pendingPlanId: null,
          ...(sameInterval
            ? {}
            : {
                currentPeriodStart: now,
                currentPeriodEnd: new Date(now.getTime() + PERIOD_DAYS[target.billingInterval] * DAY_MS),
              }),
        })
        .where(eq(subscriptions.id, subscription.id));
      if (chargeCents > 0) {
        await tx.insert(payments).values({
          subscriptionId: subscription.id,
          amountCents: chargeCents,
          status: 'succeeded',
          createdAt: now,
        });
      }
      return {
        outcome: 'applied' as const,
        from_plan: current.code,
        to_plan: target.code,
        charged_now_cents: chargeCents,
        new_price_cents: target.priceCents,
      };
    });
  }

  async cancel(customerId: number) {
    const subscription = await this.account.requireSubscription(customerId);
    if (subscription.status === 'canceled') {
      throw new ToolError('This subscription is already canceled.');
    }
    if (subscription.cancelAtPeriodEnd) {
      return {
        outcome: 'already_scheduled' as const,
        access_until: subscription.currentPeriodEnd.toISOString(),
      };
    }
    const now = this.clock.now();

    // A suspended subscription has no paid period left: it ends immediately.
    if (subscription.status === 'suspended') {
      await this.db
        .update(subscriptions)
        .set({ status: 'canceled', canceledAt: now })
        .where(eq(subscriptions.id, subscription.id));
      return { outcome: 'canceled_now' as const };
    }

    await this.db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true, canceledAt: now, pendingPlanId: null })
      .where(eq(subscriptions.id, subscription.id));
    return {
      outcome: 'scheduled' as const,
      access_until: subscription.currentPeriodEnd.toISOString(),
    };
  }
}
