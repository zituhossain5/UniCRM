import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { IntegrationSecretService } from './integration-secret.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WebhookUrlService } from './webhook-url.service';

@Global()
@Module({
  imports: [AuditModule, AuthModule, JobsModule],
  controllers: [IntegrationsController],
  providers: [IntegrationSecretService, IntegrationsService, WebhookUrlService],
  exports: [IntegrationSecretService, IntegrationsService],
})
export class IntegrationsModule {}
