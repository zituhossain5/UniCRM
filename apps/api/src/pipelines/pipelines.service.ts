import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type {
  CreatePipelineDto,
  PipelineStageInputDto,
  ReplacePipelineStagesDto,
  UpdatePipelineDto,
} from './dto/pipelines.dto';

export const DEFAULT_STAGES = [
  { name: 'New Lead', position: 0, isWon: false, isLost: false },
  { name: 'Contacted', position: 1, isWon: false, isLost: false },
  { name: 'Qualified', position: 2, isWon: false, isLost: false },
  { name: 'Proposal Sent', position: 3, isWon: false, isLost: false },
  { name: 'Negotiation', position: 4, isWon: false, isLost: false },
  { name: 'Won', position: 5, isWon: true, isLost: false },
  { name: 'Lost', position: 6, isWon: false, isLost: true },
] as const;

@Injectable()
export class PipelinesService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async ensureDefault(organizationId: string) {
    const existing = await this.prisma.pipeline.findFirst({
      where: { organizationId, isDefault: true, archivedAt: null },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    if (existing) return existing;
    const fallback = await this.prisma.pipeline.findFirst({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (fallback)
      return this.prisma.pipeline.update({
        where: { id: fallback.id },
        data: { isDefault: true },
        include: { stages: { orderBy: { position: 'asc' } } },
      });
    return this.prisma.pipeline.create({
      data: {
        organizationId,
        name: 'Sales Pipeline',
        isDefault: true,
        stages: { create: DEFAULT_STAGES.map((stage) => ({ ...stage, organizationId })) },
      },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
  }

  async list(principal: AuthenticatedPrincipal) {
    await this.ensureDefault(principal.organizationId);
    return this.prisma.pipeline.findMany({
      where: { organizationId: principal.organizationId, archivedAt: null },
      include: { stages: { orderBy: { position: 'asc' } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async stages(principal: AuthenticatedPrincipal, pipelineId: string) {
    const pipeline = await this.requirePipeline(principal.organizationId, pipelineId);
    return this.prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id, organizationId: principal.organizationId },
      orderBy: { position: 'asc' },
    });
  }

  async create(principal: AuthenticatedPrincipal, dto: CreatePipelineDto) {
    this.validateStages(dto.stages);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault)
          await tx.pipeline.updateMany({
            where: { organizationId: principal.organizationId, isDefault: true, archivedAt: null },
            data: { isDefault: false },
          });
        const pipeline = await tx.pipeline.create({
          data: {
            name: dto.name,
            organizationId: principal.organizationId,
            isDefault: dto.isDefault ?? false,
            stages: {
              create: dto.stages.map((stage) => ({
                name: stage.name,
                position: stage.position,
                isWon: stage.isWon,
                isLost: stage.isLost,
                organizationId: principal.organizationId,
              })),
            },
          },
          include: { stages: { orderBy: { position: 'asc' } } },
        });
        await this.audit.create(
          {
            action: 'PIPELINE_CREATED',
            actorId: principal.userId,
            entityId: pipeline.id,
            entityType: 'PIPELINE',
            organizationId: principal.organizationId,
          },
          tx,
        );
        return pipeline;
      });
    } catch (cause) {
      this.handleUnique(cause);
    }
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdatePipelineDto) {
    const existing = await this.requirePipeline(principal.organizationId, id);
    if (existing.isDefault && dto.isDefault === false)
      throw new ConflictException('Choose another default pipeline before removing this default');
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault && !existing.isDefault)
          await tx.pipeline.updateMany({
            where: { organizationId: principal.organizationId, isDefault: true, archivedAt: null },
            data: { isDefault: false },
          });
        const pipeline = await tx.pipeline.update({
          where: { id },
          data: dto,
          include: { stages: { orderBy: { position: 'asc' } } },
        });
        await this.audit.create(
          {
            action: 'PIPELINE_UPDATED',
            actorId: principal.userId,
            entityId: id,
            entityType: 'PIPELINE',
            organizationId: principal.organizationId,
          },
          tx,
        );
        return pipeline;
      });
    } catch (cause) {
      this.handleUnique(cause);
    }
  }

  async replaceStages(
    principal: AuthenticatedPrincipal,
    pipelineId: string,
    dto: ReplacePipelineStagesDto,
  ) {
    await this.requirePipeline(principal.organizationId, pipelineId);
    this.validateStages(dto.stages);
    const existing = await this.prisma.pipelineStage.findMany({
      where: { organizationId: principal.organizationId, pipelineId },
      include: { _count: { select: { leads: true } } },
    });
    const existingIds = new Set(existing.map(({ id }) => id));
    if (dto.stages.some((stage) => stage.id && !existingIds.has(stage.id)))
      throw new BadRequestException('A stage does not belong to this pipeline');
    const retained = new Set(dto.stages.flatMap((stage) => (stage.id ? [stage.id] : [])));
    if (existing.some((stage) => !retained.has(stage.id) && stage._count.leads > 0))
      throw new ConflictException('Stages with lead history cannot be removed');
    try {
      return await this.prisma.$transaction(async (tx) => {
        for (const stage of existing)
          await tx.pipelineStage.update({
            where: { id: stage.id },
            data: { position: -stage.position - 1000, name: stage.id },
          });
        for (const stage of dto.stages) {
          const data = {
            name: stage.name,
            position: stage.position,
            isWon: stage.isWon,
            isLost: stage.isLost,
          };
          if (stage.id) await tx.pipelineStage.update({ where: { id: stage.id }, data });
          else
            await tx.pipelineStage.create({
              data: { ...data, organizationId: principal.organizationId, pipelineId },
            });
        }
        await tx.pipelineStage.deleteMany({
          where: {
            organizationId: principal.organizationId,
            pipelineId,
            id: { notIn: [...retained] },
          },
        });
        await this.audit.create(
          {
            action: 'PIPELINE_STAGES_UPDATED',
            actorId: principal.userId,
            entityId: pipelineId,
            entityType: 'PIPELINE',
            organizationId: principal.organizationId,
          },
          tx,
        );
        return tx.pipeline.findUniqueOrThrow({
          where: { id: pipelineId },
          include: { stages: { orderBy: { position: 'asc' } } },
        });
      });
    } catch (cause) {
      this.handleUnique(cause);
    }
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    const pipeline = await this.requirePipeline(principal.organizationId, id);
    if (pipeline.isDefault) throw new ConflictException('The default pipeline cannot be archived');
    const activeLeads = await this.prisma.lead.count({
      where: { organizationId: principal.organizationId, pipelineId: id, archivedAt: null },
    });
    if (activeLeads)
      throw new ConflictException('Move active leads before archiving this pipeline');
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.pipeline.update({
        where: { id },
        data: { archivedAt: new Date() },
        include: { stages: { orderBy: { position: 'asc' } } },
      });
      await this.audit.create(
        {
          action: 'PIPELINE_ARCHIVED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'PIPELINE',
          organizationId: principal.organizationId,
        },
        tx,
      );
      return archived;
    });
  }

  private validateStages(stages: PipelineStageInputDto[]) {
    if (
      stages.filter(({ isWon }) => isWon).length !== 1 ||
      stages.filter(({ isLost }) => isLost).length !== 1
    )
      throw new BadRequestException('A pipeline requires exactly one won stage and one lost stage');
    if (stages.some(({ isWon, isLost }) => isWon && isLost))
      throw new BadRequestException('A stage cannot be both won and lost');
    if (new Set(stages.map(({ name }) => name.toLowerCase())).size !== stages.length)
      throw new BadRequestException('Stage names must be unique');
    const positions = [...stages.map(({ position }) => position)].sort((a, b) => a - b);
    if (positions.some((position, index) => position !== index))
      throw new BadRequestException('Stage positions must be contiguous and start at zero');
  }
  private async requirePipeline(organizationId: string, id: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id, organizationId, archivedAt: null },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return pipeline;
  }
  private handleUnique(cause: unknown): never {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')
      throw new ConflictException('Pipeline and stage names and positions must be unique');
    throw cause;
  }
}
