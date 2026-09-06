import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface AuditInput {
  action: string;
  actorId: string;
  entityId: string;
  entityType:
    | 'ATTACHMENT'
    | 'COMPANY'
    | 'CONTACT'
    | 'CUSTOM_FIELD'
    | 'FOLLOW_UP'
    | 'LEAD'
    | 'PAYMENT'
    | 'PROJECT'
    | 'QUOTATION'
    | 'SAVED_VIEW'
    | 'TAG'
    | 'PIPELINE'
    | 'TASK';
  metadata?: Prisma.InputJsonValue;
  organizationId: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(input: AuditInput, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    return client.activityLog.create({ data: input });
  }
}
