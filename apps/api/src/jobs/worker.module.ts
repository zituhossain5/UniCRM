import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { StructuredLogger } from '../common/structured-logger.service';
import { validateEnvironment } from '../config/environment';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../redis/redis.module';
import { JobWorkerService } from './job-worker.service';
import { JobsModule } from './jobs.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../../.env', '.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    RedisModule,
    JobsModule,
    EmailModule,
    AuthModule,
    NotificationsModule,
    IntegrationsModule,
  ],
  providers: [JobWorkerService, StructuredLogger],
})
export class WorkerModule {}
