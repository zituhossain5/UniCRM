import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { basename } from 'node:path';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { LocalStorageService } from './local-storage.service';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'text/csv',
  'text/plain',
]);
const uploaderSelect = { id: true, firstName: true, lastName: true } as const;

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LocalStorageService) private readonly storage: LocalStorageService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listProject(principal: AuthenticatedPrincipal, projectId: string) {
    await this.requireProject(principal.organizationId, projectId);
    return this.prisma.attachment.findMany({
      where: { organizationId: principal.organizationId, projectId },
      include: { uploadedBy: { select: uploaderSelect } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listTask(principal: AuthenticatedPrincipal, taskId: string) {
    await this.requireTask(principal.organizationId, taskId);
    return this.prisma.attachment.findMany({
      where: { organizationId: principal.organizationId, taskId },
      include: { uploadedBy: { select: uploaderSelect } },
      orderBy: { createdAt: 'desc' },
    });
  }

  uploadProject(principal: AuthenticatedPrincipal, projectId: string, file?: UploadedFile) {
    return this.upload(principal, file, { projectId });
  }

  uploadTask(principal: AuthenticatedPrincipal, taskId: string, file?: UploadedFile) {
    return this.upload(principal, file, { taskId });
  }

  async download(principal: AuthenticatedPrincipal, id: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return { attachment, content: await this.storage.get(attachment.storageKey) };
  }

  async delete(principal: AuthenticatedPrincipal, id: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id } });
      await this.audit.create(
        {
          action: 'ATTACHMENT_DELETED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'ATTACHMENT',
          organizationId: principal.organizationId,
          metadata: { projectId: attachment.projectId, taskId: attachment.taskId },
        },
        tx,
      );
    });
    await this.storage.delete(attachment.storageKey);
  }

  private async upload(
    principal: AuthenticatedPrincipal,
    file: UploadedFile | undefined,
    parent: { projectId: string } | { taskId: string },
  ) {
    if ('projectId' in parent)
      await this.requireProject(principal.organizationId, parent.projectId);
    else await this.requireTask(principal.organizationId, parent.taskId);
    this.validateFile(file);
    const safeName = [...basename(file.originalname)]
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join('')
      .trim();
    if (!safeName || safeName !== file.originalname || safeName.length > 255)
      throw new BadRequestException('Invalid file name');
    const storageKey = crypto.randomUUID();
    await this.storage.put(storageKey, file.buffer);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const attachment = await tx.attachment.create({
          data: {
            ...parent,
            fileName: safeName,
            mimeType: file.mimetype,
            size: file.size,
            storageKey,
            organizationId: principal.organizationId,
            uploadedById: principal.userId,
          },
          include: { uploadedBy: { select: uploaderSelect } },
        });
        await this.audit.create(
          {
            action: 'ATTACHMENT_UPLOADED',
            actorId: principal.userId,
            entityId: attachment.id,
            entityType: 'ATTACHMENT',
            organizationId: principal.organizationId,
            metadata: { fileName: safeName, ...parent },
          },
          tx,
        );
        return attachment;
      });
    } catch (cause) {
      await this.storage.delete(storageKey);
      throw cause;
    }
  }

  private validateFile(file?: UploadedFile): asserts file is UploadedFile {
    if (!file) throw new BadRequestException('A file is required');
    if (file.size < 1 || file.size > MAX_FILE_SIZE)
      throw new BadRequestException('File size must be between 1 byte and 10 MB');
    if (!ALLOWED_TYPES.has(file.mimetype)) throw new BadRequestException('Unsupported file type');
    const bytes = file.buffer;
    const validSignature =
      file.mimetype === 'text/plain' ||
      file.mimetype === 'text/csv' ||
      (file.mimetype === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-') ||
      (file.mimetype === 'image/png' &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (file.mimetype === 'image/jpeg' &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff) ||
      (file.mimetype ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b);
    if (!validSignature) throw new BadRequestException('File content does not match its type');
  }

  private async requireProject(organizationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private async requireTask(organizationId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId, archivedAt: null, project: { archivedAt: null } },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
  }
}
