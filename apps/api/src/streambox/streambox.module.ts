import { Module } from '@nestjs/common';
import { AccountService } from './account.service.js';
import { PolicyService } from './policy.service.js';
import { RefundService } from './refund.service.js';
import { Clock, SystemClock } from './rules.js';
import { SubscriptionService } from './subscription.service.js';
import { StreamboxTools } from './tools.js';

/** The StreamBox domain: data access, business rules and the agent's tools. */
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    AccountService,
    PolicyService,
    RefundService,
    SubscriptionService,
    StreamboxTools,
  ],
  exports: [Clock, AccountService, PolicyService, RefundService, SubscriptionService, StreamboxTools],
})
export class StreamboxModule {}
