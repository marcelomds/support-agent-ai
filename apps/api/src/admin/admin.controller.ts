import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Database } from '../db/database.module.js';
import { agentRuns, auditLog, customers, pendingActions } from '../db/schema.js';
import { AccountService } from '../streambox/account.service.js';
import { RefundService } from '../streambox/refund.service.js';

const RefundStatus = z.enum(['pending_approval', 'refunded', 'rejected']).optional();
const Decision = z.object({
  decision: z.enum(['approve', 'reject']),
  decidedBy: z.string().trim().min(1).max(100),
});

/**
 * Back-office endpoints used by the demo UI: pick a customer, review refunds,
 * read the audit trail. There is no authentication in this demo.
 */
@Controller()
export class AdminController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly refunds: RefundService,
    private readonly account: AccountService,
  ) {}

  @Get('customers')
  listCustomers() {
    return this.db.select().from(customers).orderBy(customers.id);
  }

  /** What the demo UI shows next to the chat: the same data the agent's read tools return. */
  @Get('customers/:id/account')
  async getAccount(@Param('id', ParseIntPipe) id: number) {
    const [customer] = await this.db.select().from(customers).where(eq(customers.id, id));
    if (!customer) throw new NotFoundException('Customer not found.');
    return {
      customer,
      subscription: await this.account.getSubscriptionSummary(id),
      payments: await this.account.listPayments(id, 5),
    };
  }

  @Get('refunds')
  listRefunds(@Query('status') status?: string) {
    const parsed = RefundStatus.safeParse(status);
    if (!parsed.success) throw new BadRequestException('Invalid status.');
    return this.refunds.list(parsed.data);
  }

  /** The human-in-the-loop step: a person approves or rejects a pending refund. */
  @Post('refunds/:id/decision')
  decideRefund(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const parsed = Decision.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    return this.refunds.decide(id, parsed.data.decision, parsed.data.decidedBy);
  }

  /**
   * Observability: what the agent costs and how it behaves, across every
   * conversation. Read from the `agent_runs`, `audit_log` and
   * `pending_actions` tables.
   */
  @Get('metrics')
  async metrics() {
    const [totals] = await this.db
      .select({
        runs: count(),
        costMicroUsd: sql<number>`coalesce(sum(${agentRuns.costMicroUsd}), 0)::int`,
        inputTokens: sql<number>`coalesce(sum(${agentRuns.inputTokens}), 0)::int`,
        cachedTokens: sql<number>`coalesce(sum(${agentRuns.cachedTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${agentRuns.outputTokens}), 0)::int`,
        modelCalls: sql<number>`coalesce(sum(${agentRuns.modelCalls}), 0)::int`,
        avgLatencyMs: sql<number>`coalesce(round(avg(${agentRuns.latencyMs})), 0)::int`,
        p95LatencyMs: sql<number>`coalesce(round(percentile_cont(0.95) within group (order by ${agentRuns.latencyMs})), 0)::int`,
        notCompleted: sql<number>`count(*) filter (where ${agentRuns.stopReason} <> 'completed')::int`,
      })
      .from(agentRuns);

    const tools = await this.db
      .select({
        name: auditLog.action,
        calls: count(),
        errors: sql<number>`count(*) filter (where ${auditLog.result}->>'ok' = 'false')::int`,
      })
      .from(auditLog)
      .where(eq(auditLog.actor, 'agent'))
      .groupBy(auditLog.action)
      .orderBy(desc(count()));

    const actions = await this.db
      .select({ status: pendingActions.status, count: count() })
      .from(pendingActions)
      .groupBy(pendingActions.status);

    const recent = await this.db
      .select({
        id: agentRuns.id,
        createdAt: agentRuns.createdAt,
        customerName: customers.name,
        model: agentRuns.model,
        stopReason: agentRuns.stopReason,
        modelCalls: agentRuns.modelCalls,
        toolCalls: agentRuns.toolCalls,
        inputTokens: agentRuns.inputTokens,
        cachedTokens: agentRuns.cachedTokens,
        outputTokens: agentRuns.outputTokens,
        costMicroUsd: agentRuns.costMicroUsd,
        latencyMs: agentRuns.latencyMs,
      })
      .from(agentRuns)
      .leftJoin(customers, eq(agentRuns.customerId, customers.id))
      .orderBy(desc(agentRuns.id))
      .limit(20);

    return {
      totals,
      tools,
      actions: Object.fromEntries(actions.map((row) => [row.status, row.count])),
      recent,
    };
  }

  @Get('audit')
  listAudit() {
    return this.db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(100);
  }
}
