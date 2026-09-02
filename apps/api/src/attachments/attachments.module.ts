import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import {
  AttachmentsController,
  ProjectAttachmentsController,
  TaskAttachmentsController,
} from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { LocalStorageService } from './local-storage.service';

@Module({
  imports: [AuditModule],
  controllers: [AttachmentsController, ProjectAttachmentsController, TaskAttachmentsController],
  providers: [AttachmentsService, LocalStorageService],
})
export class AttachmentsModule {}
