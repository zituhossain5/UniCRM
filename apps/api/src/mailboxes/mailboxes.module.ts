import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MailController, MailboxesController } from './mailboxes.controller';
import { MailboxesService } from './mailboxes.service';
import { LeadsModule } from '../leads/leads.module';
import { TasksModule } from '../tasks/tasks.module';
import { SharedInboxService } from './shared-inbox.service';

@Module({
  imports: [
    AttachmentsModule,
    AuditModule,
    AuthModule,
    EmailModule,
    IntegrationsModule,
    LeadsModule,
    TasksModule,
  ],
  controllers: [MailboxesController, MailController],
  providers: [MailboxesService, SharedInboxService],
  exports: [MailboxesService, SharedInboxService],
})
export class MailboxesModule {}
