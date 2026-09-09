import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

@Global()
@Module({
  imports: [AuditModule, IntegrationsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
