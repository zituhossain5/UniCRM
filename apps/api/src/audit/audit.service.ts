import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface AuditInput {
  action: string;
  actorId: string;
  entityId: string;
  entityType: 'COMPANY' | 'CONTACT' | 'LEAD' | 'FOLLOW_UP';
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
