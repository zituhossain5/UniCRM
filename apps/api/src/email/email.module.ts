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
import { MailboxTransportService } from './mailbox-transport.service';
import { IntegrationsModule } from '../integrations/integrations.module';

@Global()
@Module({
  controllers: [
    EmailController,
    EmailTemplatesController,
    EmailSettingsController,
    CrmEmailsController,
  ],
  exports: [EmailService, EmailTransportService, MailboxTransportService, CrmEmailService],
  imports: [JobsModule, IntegrationsModule],
  providers: [EmailService, EmailTransportService, MailboxTransportService, CrmEmailService],
})
export class EmailModule {}
