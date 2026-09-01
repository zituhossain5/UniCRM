import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedPrincipal } from '../auth/auth.types';

export const DEFAULT_STAGES = [
  { name: 'New Lead', position: 1, isWon: false, isLost: false },
  { name: 'Contacted', position: 2, isWon: false, isLost: false },
  { name: 'Qualified', position: 3, isWon: false, isLost: false },
  { name: 'Proposal Sent', position: 4, isWon: false, isLost: false },
  { name: 'Negotiation', position: 5, isWon: false, isLost: false },
  { name: 'Won', position: 6, isWon: true, isLost: false },
  { name: 'Lost', position: 7, isWon: false, isLost: true },
] as const;

@Injectable()
export class PipelinesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async ensureDefault(organizationId: string) {
    const pipeline = await this.prisma.pipeline.upsert({
      where: { organizationId_name: { organizationId, name: 'Sales Pipeline' } },
      create: { organizationId, name: 'Sales Pipeline', isDefault: true },
      update: { isDefault: true },
    });
    for (const stage of DEFAULT_STAGES) {
      await this.prisma.pipelineStage.upsert({
        where: { pipelineId_name: { pipelineId: pipeline.id, name: stage.name } },
        create: { ...stage, organizationId, pipelineId: pipeline.id },
        update: { position: stage.position, isWon: stage.isWon, isLost: stage.isLost },
      });
    }
    return this.prisma.pipeline.findUniqueOrThrow({
      where: { id: pipeline.id },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
  }
  async list(principal: AuthenticatedPrincipal) {
    await this.ensureDefault(principal.organizationId);
    return this.prisma.pipeline.findMany({
      where: { organizationId: principal.organizationId },
      include: { stages: { orderBy: { position: 'asc' } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }
  async stages(principal: AuthenticatedPrincipal, pipelineId: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, organizationId: principal.organizationId },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return this.prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id, organizationId: principal.organizationId },
      orderBy: { position: 'asc' },
    });
  }
}
