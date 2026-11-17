import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { DB, type Database } from '../db/database.module.js';
import { auditLog, customers } from '../db/schema.js';
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
  ) {}

  @Get('customers')
  listCustomers() {
    return this.db.select().from(customers).orderBy(customers.id);
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

  @Get('audit')
  listAudit() {
    return this.db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(100);
  }
}
