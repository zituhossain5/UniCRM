import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, SecurityEventType } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { RequestMetadata } from './auth.types';

@Injectable()
export class SecurityEventsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: {
    eventType: SecurityEventType;
    organizationId?: string;
    userId?: string;
    metadata?: Prisma.InputJsonValue;
    request?: RequestMetadata;
  }): Promise<void> {
    await this.prisma.securityEvent.create({
      data: {
        eventType: input.eventType,
        ipAddress: input.request?.ipAddress,
        metadata: input.metadata,
        organizationId: input.organizationId,
        userAgent: input.request?.userAgent,
        userId: input.userId,
      },
    });
  }
}
