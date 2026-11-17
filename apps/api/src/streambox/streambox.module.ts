import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountService } from './account.service.js';
import { Embedder, LocalEmbedder } from './embedder.js';
import { PolicyService } from './policy.service.js';
import { RefundService } from './refund.service.js';
import { Clock, SystemClock } from './rules.js';
import { SubscriptionService } from './subscription.service.js';
import { StreamboxTools } from './tools.js';

/** The StreamBox domain: data access, business rules and the agent's tools. */
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    {
      provide: Embedder,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new LocalEmbedder(
          config.get<string>('EMBEDDING_MODEL') || undefined,
          Number(config.get('EMBEDDING_MIN_SIMILARITY') ?? 0.8),
        ),
    },
    AccountService,
    PolicyService,
    RefundService,
    SubscriptionService,
    StreamboxTools,
  ],
  exports: [Clock, Embedder, AccountService, PolicyService, RefundService, SubscriptionService, StreamboxTools],
})
export class StreamboxModule {}
