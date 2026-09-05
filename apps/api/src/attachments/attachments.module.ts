import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import {
  AttachmentsController,
  ProjectAttachmentsController,
  TaskAttachmentsController,
} from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { ATTACHMENT_STORAGE } from './storage.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [AttachmentsController, ProjectAttachmentsController, TaskAttachmentsController],
  providers: [
    AttachmentsService,
    LocalStorageService,
    S3StorageService,
    {
      inject: [ConfigService, LocalStorageService, S3StorageService],
      provide: ATTACHMENT_STORAGE,
      useFactory: (config: ConfigService, local: LocalStorageService, s3: S3StorageService) =>
        config.get('STORAGE_DRIVER') === 's3' ? s3 : local,
    },
  ],
  exports: [ATTACHMENT_STORAGE],
})
export class AttachmentsModule {}
