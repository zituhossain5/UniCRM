import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AutomationsModule } from '../automations/automations.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { JobsModule } from '../jobs/jobs.module';
import { TagsModule } from '../tags/tags.module';
import { WebToLeadController } from './web-to-lead.controller';
import { WebToLeadService } from './web-to-lead.service';

@Module({
  imports: [
    AuthModule,
    AutomationsModule,
    CustomFieldsModule,
    IntegrationsModule,
    JobsModule,
    TagsModule,
  ],
  controllers: [WebToLeadController],
  providers: [WebToLeadService],
  exports: [WebToLeadService],
})
export class WebToLeadModule {}
