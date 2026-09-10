import { Global, Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { EmailController } from './email.controller';
import {
  CrmEmailsController,
  EmailSettingsController,
  EmailTemplatesController,
} from './crm-email.controller';
import { CrmEmailService } from './crm-email.service';
import { EmailService, EmailTransportService } from './email.service';

@Global()
@Module({
  controllers: [
    EmailController,
    EmailTemplatesController,
    EmailSettingsController,
    CrmEmailsController,
  ],
  exports: [EmailService, EmailTransportService, CrmEmailService],
  imports: [JobsModule],
  providers: [EmailService, EmailTransportService, CrmEmailService],
})
export class EmailModule {}
