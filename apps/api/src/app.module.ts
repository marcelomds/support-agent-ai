import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env lives at the repo root; fall back to a local one.
      envFilePath: ['../../.env', '.env'],
    }),
    DatabaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
