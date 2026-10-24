import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ATTACHMENT_STORAGE, type AttachmentStorage } from '../attachments/storage.service';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DemoCleanupService {
  private readonly logger = new Logger(DemoCleanupService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
  ) {}

  async cleanupExpired(now = new Date()): Promise<number> {
    if (this.config.get('RUNTIME_MODE', { infer: true }) !== 'demo') return 0;
    const organizations = await this.prisma.organization.findMany({
      where: { mode: 'DEMO', demoExpiresAt: { lte: now } },
      take: this.config.get('DEMO_CLEANUP_BATCH_SIZE', { infer: true }),
      orderBy: { demoExpiresAt: 'asc' },
      select: { id: true },
    });
    let deleted = 0;
    for (const organization of organizations) {
      deleted += await this.destroyDemoOrganization(organization.id, now);
    }
    if (deleted) this.logger.log(`Expired demo workspaces removed count=${deleted}`);
    return deleted;
  }

  async destroyDemoOrganization(organizationId: string, expiredAt?: Date): Promise<number> {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        mode: 'DEMO',
        ...(expiredAt ? { demoExpiresAt: { lte: expiredAt } } : {}),
      },
      select: { id: true },
    });
    if (!organization) return 0;

    const [attachments, emailAttachments] = await Promise.all([
      this.prisma.attachment.findMany({
        where: { organizationId },
        select: { storageKey: true },
      }),
      this.prisma.emailAttachment.findMany({
        where: { organizationId },
        select: { storageKey: true },
      }),
    ]);
    for (const { storageKey } of [...attachments, ...emailAttachments]) {
      try {
        await this.storage.delete(storageKey);
      } catch {
        this.logger.warn(`Demo attachment cleanup deferred organizationId=${organizationId}`);
      }
    }
    const result = await this.prisma.organization.deleteMany({
      where: {
        id: organizationId,
        mode: 'DEMO',
        ...(expiredAt ? { demoExpiresAt: { lte: expiredAt } } : {}),
      },
    });
    return result.count;
  }
}
