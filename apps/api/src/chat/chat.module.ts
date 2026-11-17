import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicModelClient, MODEL_CLIENT } from '../agent/model-client.js';
import { StreamboxModule } from '../streambox/streambox.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { PendingActionsService } from './pending-actions.service.js';

@Module({
  imports: [StreamboxModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    PendingActionsService,
    {
      provide: MODEL_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new AnthropicModelClient({
          apiKey: config.get<string>('ANTHROPIC_API_KEY') || undefined,
          model: config.get<string>('ANTHROPIC_MODEL') ?? 'claude-opus-5-5',
          effort: config.get('AGENT_EFFORT') ?? 'low',
          maxTokens: Number(config.get('AGENT_MAX_TOKENS') ?? 16000),
        }),
    },
  ],
  exports: [ChatService, PendingActionsService],
})
export class ChatModule {}
