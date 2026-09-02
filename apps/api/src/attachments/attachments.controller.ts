import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentPrincipal, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AttachmentsService, type UploadedFile as FileUpload } from './attachments.service';

const upload = FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

@Controller('projects/:projectId/attachments')
export class ProjectAttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}

  @RequirePermission(PERMISSIONS.attachmentRead)
  @Get()
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return { data: await this.attachments.listProject(principal, projectId) };
  }

  @RequirePermission(PERMISSIONS.attachmentCreate)
  @Post()
  @UseInterceptors(upload)
  async upload(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile() file?: FileUpload,
  ) {
    return { data: await this.attachments.uploadProject(principal, projectId, file) };
  }
}

@Controller('tasks/:taskId/attachments')
export class TaskAttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}

  @RequirePermission(PERMISSIONS.attachmentRead)
  @Get()
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return { data: await this.attachments.listTask(principal, taskId) };
  }

  @RequirePermission(PERMISSIONS.attachmentCreate)
  @Post()
  @UseInterceptors(upload)
  async upload(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @UploadedFile() file?: FileUpload,
  ) {
    return { data: await this.attachments.uploadTask(principal, taskId, file) };
  }
}

@Controller('attachments')
export class AttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}

  @RequirePermission(PERMISSIONS.attachmentRead)
  @Get(':id/download')
  async download(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { attachment, content } = await this.attachments.download(principal, id);
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', attachment.size.toString());
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${attachment.fileName.replace(/["\\]/g, '_')}"`,
    );
    return new StreamableFile(content);
  }

  @RequirePermission(PERMISSIONS.attachmentDelete)
  @Delete(':id')
  @HttpCode(204)
  async delete(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.attachments.delete(principal, id);
  }
}
