import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { ToolError } from '../agent/tool.js';
import { DB, type Database, type Executor } from '../db/database.module.js';
import { auditLog, customers, payments, refunds, subscriptions } from '../db/schema.js';
import { isDuplicate } from './account.service.js';
import {
  Clock,
  DAY_MS,
  REFUND_APPROVAL_THRESHOLD_CENTS,
  REFUND_WINDOW_DAYS,
  formatUsd,
} from './rules.js';

export type RefundOutcome =
  | { outcome: 'refunded'; refund_id: number; amount_cents: number; rule: string }
  | { outcome: 'pending_approval'; refund_id: number; amount_cents: number; explanation: string }
  | { outcome: 'denied'; explanation: string };

@Injectable()
export class RefundService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /**
   * Applies the refund policy to one payment.
   * This is the single place where the rules are enforced. The agent cannot
   * skip it, whatever the conversation says.
   */
  async request(
    customerId: number,
    paymentId: number,
    reason: string,
    db: Executor = this.db,
  ): Promise<RefundOutcome> {
    return db.transaction(async (tx) => {
      // The payment must belong to the customer in the session.
      const [row] = await tx
        .select({ payment: payments })
        .from(payments)
        .innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
        .where(and(eq(payments.id, paymentId), eq(subscriptions.customerId, customerId)))
        .for('update', { of: payments });
      if (!row) throw new ToolError('Payment not found for this customer.');
      const { payment } = row;

      if (payment.status === 'refunded') {
        return { outcome: 'denied', explanation: 'This payment was already refunded.' };
      }
      if (payment.status === 'failed') {
        return { outcome: 'denied', explanation: 'This charge failed, so no money was taken.' };
      }
      const [open] = await tx
        .select()
        .from(refunds)
        .where(and(eq(refunds.paymentId, paymentId), eq(refunds.status, 'pending_approval')));
      if (open) {
        return {
          outcome: 'pending_approval',
          refund_id: open.id,
          amount_cents: open.amountCents,
          explanation: 'A refund for this payment is already waiting for human approval.',
        };
      }

      const siblings = await tx
        .select()
        .from(payments)
        .where(eq(payments.subscriptionId, payment.subscriptionId));
      const daysAgo = (this.clock.now().getTime() - payment.createdAt.getTime()) / DAY_MS;
      const rule =
        daysAgo <= REFUND_WINDOW_DAYS
          ? 'within_window'
          : isDuplicate(payment, siblings)
            ? 'duplicate_charge'
            : null;
      if (!rule) {
        return {
          outcome: 'denied',
          explanation:
            `Refunds are available within ${REFUND_WINDOW_DAYS} days of the charge. ` +
            `This charge was ${Math.floor(daysAgo)} days ago and is not a duplicate.`,
        };
      }

      const needsApproval = payment.amountCents > REFUND_APPROVAL_THRESHOLD_CENTS;
      const [refund] = await tx
        .insert(refunds)
        .values({
          paymentId,
          customerId,
          amountCents: payment.amountCents,
          reason,
          rule,
          status: needsApproval ? 'pending_approval' : 'refunded',
          decidedBy: needsApproval ? null : 'policy',
          decidedAt: needsApproval ? null : this.clock.now(),
        })
        .returning();

      if (needsApproval) {
        return {
          outcome: 'pending_approval',
          refund_id: refund.id,
          amount_cents: refund.amountCents,
          explanation:
            `Refunds above ${formatUsd(REFUND_APPROVAL_THRESHOLD_CENTS)} need approval ` +
            'from a human agent. The request was sent for review.',
        };
      }
      await tx.update(payments).set({ status: 'refunded' }).where(eq(payments.id, paymentId));
      return { outcome: 'refunded', refund_id: refund.id, amount_cents: refund.amountCents, rule };
    });
  }

  /** Refund requests for the human approval screen, newest first. */
  async list(status?: 'pending_approval' | 'refunded' | 'rejected') {
    return this.db
      .select({
        id: refunds.id,
        status: refunds.status,
        amountCents: refunds.amountCents,
        reason: refunds.reason,
        rule: refunds.rule,
        paymentId: refunds.paymentId,
        customerName: customers.name,
        customerEmail: customers.email,
        decidedBy: refunds.decidedBy,
        decidedAt: refunds.decidedAt,
        createdAt: refunds.createdAt,
      })
      .from(refunds)
      .innerJoin(customers, eq(refunds.customerId, customers.id))
      .where(status ? eq(refunds.status, status) : undefined)
      .orderBy(desc(refunds.createdAt));
  }

  /** A human approves or rejects a pending refund. */
  async decide(refundId: number, decision: 'approve' | 'reject', decidedBy: string) {
    return this.db.transaction(async (tx) => {
      const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for('update');
      if (!refund) throw new NotFoundException('Refund not found.');
      if (refund.status !== 'pending_approval') {
        throw new ConflictException(`Refund is already ${refund.status}.`);
      }

      const status = decision === 'approve' ? 'refunded' : 'rejected';
      const [updated] = await tx
        .update(refunds)
        .set({ status, decidedBy, decidedAt: this.clock.now() })
        .where(eq(refunds.id, refundId))
        .returning();
      if (status === 'refunded') {
        await tx.update(payments).set({ status: 'refunded' }).where(eq(payments.id, refund.paymentId));
      }
      await tx.insert(auditLog).values({
        customerId: refund.customerId,
        actor: 'human',
        action: `refund_${decision}`,
        input: { refund_id: refundId, decided_by: decidedBy },
        result: { status },
      });
      return updated;
    });
  }
}
