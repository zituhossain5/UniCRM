import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MailController, MailboxesController } from './mailboxes.controller';
import { MailboxesService } from './mailboxes.service';

@Module({
  imports: [AttachmentsModule, AuditModule, AuthModule, EmailModule, IntegrationsModule],
  controllers: [MailboxesController, MailController],
  providers: [MailboxesService],
  exports: [MailboxesService],
})
export class MailboxesModule {}
