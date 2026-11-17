import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin/admin.controller.js';
import { ChatModule } from './chat/chat.module.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { StreamboxModule } from './streambox/streambox.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env lives at the repo root; fall back to a local one.
      envFilePath: ['../../.env', '.env'],
    }),
    DatabaseModule,
    StreamboxModule,
    ChatModule,
  ],
  controllers: [HealthController, AdminController],
})
export class AppModule {}
