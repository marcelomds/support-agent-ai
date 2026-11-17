/**
 * The StreamBox tools: everything the agent can do in this domain.
 *
 * Note what is missing from every schema: a customer id. The customer comes
 * from `ctx`, which the application fills from the session. The model cannot
 * ask for another customer's data because there is no parameter to ask with.
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { defineTool, type AgentTool } from '../agent/tool.js';
import { AccountService } from './account.service.js';
import { PolicyService } from './policy.service.js';
import { RefundService } from './refund.service.js';
import { SubscriptionService } from './subscription.service.js';

@Injectable()
export class StreamboxTools {
  constructor(
    private readonly account: AccountService,
    private readonly policies: PolicyService,
    private readonly refunds: RefundService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  all(): AgentTool[] {
    return [
      defineTool({
        name: 'get_subscription',
        kind: 'read',
        description:
          "Returns the customer's current subscription: plan, status, billing period dates, " +
          'whether a cancellation is scheduled, and any pending downgrade. ' +
          'Call this before answering anything about their plan or access.',
        schema: z.object({}),
        execute: (_input, ctx) => this.account.getSubscriptionSummary(ctx.customerId),
      }),

      defineTool({
        name: 'list_payments',
        kind: 'read',
        description:
          "Lists the customer's most recent charges, newest first, including failed ones. " +
          'Each entry has the payment_id needed for request_refund, how many days ago it was ' +
          'charged, and whether it is inside the refund window or looks like a duplicate.',
        schema: z.object({
          limit: z.number().int().min(1).max(20).default(5)
            .describe('How many charges to return. Defaults to 5.'),
        }),
        execute: ({ limit }, ctx) => this.account.listPayments(ctx.customerId, limit),
      }),

      defineTool({
        name: 'list_plans',
        kind: 'read',
        description:
          'Returns the plan catalog: code, name, price in cents, billing interval, screens ' +
          'and offline downloads. Use the code when calling change_plan.',
        schema: z.object({}),
        execute: async () =>
          (await this.account.listPlans()).map((plan) => ({
            code: plan.code,
            name: plan.name,
            price_cents: plan.priceCents,
            billing_interval: plan.billingInterval,
            max_screens: plan.maxScreens,
            offline_downloads: plan.offlineDownloads,
          })),
      }),

      defineTool({
        name: 'search_policies',
        kind: 'read',
        description:
          'Searches the official StreamBox policies (cancellation, refunds, plan changes, ' +
          'billing) and returns the most relevant sections. Use it for any question about ' +
          'rules or how things work, and base the answer only on what it returns. ' +
          'The policies are written in English, so search with English keywords.',
        schema: z.object({
          query: z.string().min(2).describe('Keywords, e.g. "refund after 7 days duplicate charge".'),
        }),
        execute: async ({ query }) => {
          const sections = await this.policies.search(query);
          return sections.length > 0 ? { sections } : { sections: [], note: 'No policy section matched.' };
        },
      }),

      defineTool({
        name: 'change_plan',
        kind: 'write',
        description:
          "Changes the customer's plan. Upgrades apply immediately and may charge the customer now; " +
          'downgrades are scheduled for the next billing period. ' +
          'Only call this after the customer has explicitly confirmed the specific plan.',
        schema: z.object({
          plan_code: z.string().describe('Target plan code from list_plans, e.g. "premium_monthly".'),
        }),
        execute: ({ plan_code }, ctx) => this.subscriptions.changePlan(ctx.customerId, plan_code),
      }),

      defineTool({
        name: 'cancel_subscription',
        kind: 'write',
        description:
          "Cancels the customer's subscription. Access continues until the end of the paid period. " +
          'Only call this after the customer has explicitly confirmed they want to cancel.',
        schema: z.object({}),
        execute: (_input, ctx) => this.subscriptions.cancel(ctx.customerId),
      }),

      defineTool({
        name: 'request_refund',
        kind: 'write',
        description:
          'Requests a refund for one charge. The system applies the refund policy and returns one of: ' +
          '"refunded" (done), "pending_approval" (a human will review it), or "denied" (with the reason). ' +
          'The outcome is final: report it as returned and never promise a different result. ' +
          'Only call this after the customer has confirmed which charge they want refunded.',
        schema: z.object({
          payment_id: z.number().int().describe('The payment_id from list_payments.'),
          reason: z.string().min(3).describe("The customer's reason, in a short sentence."),
        }),
        execute: ({ payment_id, reason }, ctx) =>
          this.refunds.request(ctx.customerId, payment_id, reason),
      }),
    ];
  }
}
