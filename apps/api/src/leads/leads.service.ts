import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isISO8601, isUUID } from 'class-validator';
import type { Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { PERMISSIONS } from '../auth/auth.constants';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { LeadPriority, LeadSource } from '../generated/prisma/enums';
import { PipelinesService } from '../pipelines/pipelines.service';
import type {
  ActivityListQueryDto,
  CreateActivityDto,
  CreateFollowUpDto,
  CreateLeadDto,
  FollowUpListQueryDto,
  LeadListQueryDto,
  RescheduleFollowUpDto,
  UpdateLeadDto,
  UpdateLeadOwnerDto,
  UpdateLeadStageDto,
} from './dto/leads.dto';

const userSelect = { id: true, firstName: true, lastName: true } as const;
const leadInclude = {
  company: { select: { id: true, name: true, status: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  owner: { select: userSelect },
  pipeline: { select: { id: true, name: true } },
  stage: { select: { id: true, name: true, position: true, isWon: true, isLost: true } },
} as const;

@Injectable()
export class LeadsService {
  constructor(
    @Inject(PipelinesService) private readonly pipelines: PipelinesService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: LeadListQueryDto) {
    if (query.priority && !Object.values(LeadPriority).includes(query.priority))
      throw new BadRequestException('Unsupported lead priority');
    if (query.source && !Object.values(LeadSource).includes(query.source))
      throw new BadRequestException('Unsupported lead source');
    if (query.view && !['all', 'mine', 'followUpDue', 'won', 'lost'].includes(query.view))
      throw new BadRequestException('Unsupported lead view');
    for (const [name, value] of [
      ['stage', query.stage],
      ['owner', query.owner],
      ['company', query.company],
    ] as const) {
      if (value && !isUUID(value)) throw new BadRequestException(`${name} must be a UUID`);
    }
    for (const [name, value] of [
      ['createdFrom', query.createdFrom],
      ['createdTo', query.createdTo],
    ] as const) {
      if (value && !isISO8601(value))
        throw new BadRequestException(`${name} must be an ISO 8601 date`);
    }
    if (
      query.createdFrom &&
      query.createdTo &&
      new Date(query.createdFrom) > new Date(query.createdTo)
    )
      throw new BadRequestException('createdFrom must not be after createdTo');
    const listQuery = normalizeListQuery(query, 'createdAt', [
      'title',
      'createdAt',
      'updatedAt',
      'estimatedValue',
      'nextFollowUpAt',
      'lastActivityAt',
    ]);
    const now = new Date();
    const endToday = new Date(now);
    endToday.setHours(23, 59, 59, 999);
    const where: Prisma.LeadWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.stage ? { stageId: query.stage } : {}),
      ...(query.owner ? { ownerId: query.owner } : {}),
      ...(query.company ? { companyId: query.company } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.view === 'mine' ? { ownerId: principal.userId } : {}),
      ...(query.view === 'won' ? { stage: { isWon: true } } : {}),
      ...(query.view === 'lost' ? { stage: { isLost: true } } : {}),
      ...(query.view === 'followUpDue'
        ? { followUps: { some: { status: 'PENDING', dueAt: { lte: endToday } } } }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(listQuery.search
        ? {
            OR: [
              { title: { contains: listQuery.search, mode: 'insensitive' } },
              { firstName: { contains: listQuery.search, mode: 'insensitive' } },
              { lastName: { contains: listQuery.search, mode: 'insensitive' } },
              { email: { contains: listQuery.search, mode: 'insensitive' } },
              { phone: { contains: listQuery.search, mode: 'insensitive' } },
              { company: { name: { contains: listQuery.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: { [listQuery.sort]: listQuery.order },
        skip: (listQuery.page - 1) * listQuery.limit,
        take: listQuery.limit,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { data, meta: paginationMeta(listQuery.page, listQuery.limit, total) };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: {
        ...leadInclude,
        activities: {
          include: { createdBy: { select: userSelect } },
          orderBy: { occurredAt: 'desc' },
          take: 20,
        },
        followUps: {
          include: { assignedTo: { select: userSelect } },
          orderBy: { dueAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    const project = principal.permissions.includes(PERMISSIONS.projectRead)
      ? await this.prisma.project.findFirst({
          where: { organizationId: principal.organizationId, sourceLeadId: id },
          select: { id: true, name: true, status: true, archivedAt: true },
        })
      : null;
    return { ...lead, project };
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateLeadDto) {
    if (dto.ownerId && !principal.permissions.includes(PERMISSIONS.leadAssign))
      throw new ForbiddenException('Insufficient permission to assign lead owner');
    const pipeline = await this.pipelines.ensureDefault(principal.organizationId);
    const firstStage = pipeline.stages[0];
    if (!firstStage) throw new ConflictException('The default pipeline has no stages');
    await this.validateRelationships(
      principal.organizationId,
      dto.companyId,
      dto.contactId,
      dto.ownerId,
    );
    const { nextFollowUpAt, ...input } = dto;
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const lead = await tx.lead.create({
        data: {
          ...input,
          estimatedValue: input.estimatedValue,
          normalizedEmail: input.email?.toLowerCase(),
          createdById: principal.userId,
          organizationId: principal.organizationId,
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : undefined,
        },
        include: leadInclude,
      });
      await tx.leadActivity.create({
        data: {
          organizationId: principal.organizationId,
          leadId: lead.id,
          type: 'SYSTEM',
          title: 'Lead created',
          occurredAt: now,
          createdById: principal.userId,
        },
      });
      if (nextFollowUpAt) {
        await tx.followUp.create({
          data: {
            organizationId: principal.organizationId,
            leadId: lead.id,
            dueAt: new Date(nextFollowUpAt),
            assignedToId: dto.ownerId ?? principal.userId,
            createdById: principal.userId,
          },
        });
        await tx.leadActivity.create({
          data: {
            organizationId: principal.organizationId,
            leadId: lead.id,
            type: 'FOLLOW_UP',
            title: 'Follow-up scheduled',
            description: `Due ${new Date(nextFollowUpAt).toISOString()}`,
            occurredAt: now,
            createdById: principal.userId,
          },
        });
      }
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'LEAD',
          entityId: lead.id,
          action: 'LEAD_CREATED',
        },
      });
      return lead;
    });
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateLeadDto) {
    const existing = await this.requireLead(principal, id);
    await this.validateRelationships(
      principal.organizationId,
      dto.companyId !== undefined ? dto.companyId : existing.companyId,
      dto.contactId !== undefined ? dto.contactId : existing.contactId,
    );
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const companyChanged = dto.companyId !== undefined && dto.companyId !== existing.companyId;
      const lead = await tx.lead.update({
        where: { id },
        data: {
          ...dto,
          estimatedValue: dto.estimatedValue,
          ...(dto.email !== undefined ? { normalizedEmail: dto.email.toLowerCase() } : {}),
          ...(companyChanged ? { lastActivityAt: now } : {}),
        },
        include: leadInclude,
      });
      if (companyChanged) {
        await tx.leadActivity.create({
          data: {
            organizationId: principal.organizationId,
            leadId: id,
            type: 'SYSTEM',
            title: 'Company association changed',
            occurredAt: now,
            createdById: principal.userId,
            metadata: { fromCompanyId: existing.companyId, toCompanyId: dto.companyId },
          },
        });
      }
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'LEAD',
          entityId: id,
          action: 'LEAD_UPDATED',
        },
      });
      return lead;
    });
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    await this.requireLead(principal, id);
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const lead = await tx.lead.update({
        where: { id },
        data: { archivedAt: now },
        include: leadInclude,
      });
      await tx.followUp.updateMany({
        where: { leadId: id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'LEAD',
          entityId: id,
          action: 'LEAD_ARCHIVED',
        },
      });
      return lead;
    });
  }

  async changeStage(principal: AuthenticatedPrincipal, id: string, dto: UpdateLeadStageDto) {
    const lead = await this.requireLead(principal, id);
    const stage = await this.prisma.pipelineStage.findFirst({
      where: {
        id: dto.stageId,
        organizationId: principal.organizationId,
        pipelineId: lead.pipelineId,
      },
    });
    if (!stage) throw new BadRequestException('Pipeline stage is invalid or unavailable');
    if (stage.id === lead.stageId) return lead;
    if (stage.isLost && !dto.lostReason)
      throw new BadRequestException('A lost reason is required when marking a lead lost');
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.lead.update({
        where: { id },
        data: {
          stageId: stage.id,
          lostReason: stage.isLost ? dto.lostReason : null,
          lastActivityAt: now,
        },
        include: leadInclude,
      });
      await tx.leadActivity.create({
        data: {
          organizationId: principal.organizationId,
          leadId: id,
          type: 'STATUS_CHANGE',
          title: 'Stage changed',
          description: `${lead.stage.name} -> ${stage.name}`,
          occurredAt: now,
          createdById: principal.userId,
          metadata: { fromStageId: lead.stageId, toStageId: stage.id },
        },
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'LEAD',
          entityId: id,
          action: 'LEAD_STAGE_CHANGED',
          metadata: { fromStageId: lead.stageId, toStageId: stage.id },
        },
      });
      return updated;
    });
  }

  async changeOwner(principal: AuthenticatedPrincipal, id: string, dto: UpdateLeadOwnerDto) {
    const lead = await this.requireLead(principal, id);
    if (dto.ownerId === lead.ownerId) return lead;
    await this.validateRelationships(principal.organizationId, undefined, undefined, dto.ownerId);
    const owner = dto.ownerId
      ? await this.prisma.user.findUnique({ where: { id: dto.ownerId }, select: userSelect })
      : null;
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.lead.update({
        where: { id },
        data: { ownerId: dto.ownerId, lastActivityAt: now },
        include: leadInclude,
      });
      await tx.leadActivity.create({
        data: {
          organizationId: principal.organizationId,
          leadId: id,
          type: 'OWNER_CHANGE',
          title: 'Owner changed',
          description: `${lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : 'Unassigned'} -> ${owner ? `${owner.firstName} ${owner.lastName}` : 'Unassigned'}`,
          occurredAt: now,
          createdById: principal.userId,
          metadata: { fromOwnerId: lead.ownerId, toOwnerId: dto.ownerId },
        },
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'LEAD',
          entityId: id,
          action: 'LEAD_OWNER_CHANGED',
          metadata: { fromOwnerId: lead.ownerId, toOwnerId: dto.ownerId },
        },
      });
      return updated;
    });
  }

  async activities(principal: AuthenticatedPrincipal, leadId: string, query: ActivityListQueryDto) {
    const listQuery = normalizeListQuery(query, 'occurredAt', ['occurredAt', 'createdAt']);
    await this.requireLead(principal, leadId);
    const where = { organizationId: principal.organizationId, leadId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.leadActivity.findMany({
        where,
        include: { createdBy: { select: userSelect } },
        orderBy: { [listQuery.sort]: listQuery.order },
        skip: (listQuery.page - 1) * listQuery.limit,
        take: listQuery.limit,
      }),
      this.prisma.leadActivity.count({ where }),
    ]);
    return { data, meta: paginationMeta(listQuery.page, listQuery.limit, total) };
  }

  async addActivity(principal: AuthenticatedPrincipal, leadId: string, dto: CreateActivityDto) {
    const lead = await this.requireLead(principal, leadId);
    return this.prisma.$transaction(async (tx) => {
      const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
      const activity = await tx.leadActivity.create({
        data: {
          ...dto,
          occurredAt,
          organizationId: principal.organizationId,
          leadId,
          createdById: principal.userId,
        },
        include: { createdBy: { select: userSelect } },
      });
      const lastActivityAt =
        !lead.lastActivityAt || occurredAt > lead.lastActivityAt ? occurredAt : lead.lastActivityAt;
      await tx.lead.update({ where: { id: leadId }, data: { lastActivityAt } });
      return activity;
    });
  }

  async createFollowUp(principal: AuthenticatedPrincipal, leadId: string, dto: CreateFollowUpDto) {
    await this.requireLead(principal, leadId);
    await this.validateRelationships(
      principal.organizationId,
      undefined,
      undefined,
      dto.assignedToId,
    );
    return this.prisma.$transaction(async (tx) => {
      const dueAt = new Date(dto.dueAt);
      const now = new Date();
      const followUp = await tx.followUp.create({
        data: {
          ...dto,
          dueAt,
          organizationId: principal.organizationId,
          leadId,
          assignedToId: dto.assignedToId === undefined ? principal.userId : dto.assignedToId,
          createdById: principal.userId,
        },
        include: { assignedTo: { select: userSelect } },
      });
      const next = await tx.followUp.findFirst({
        where: { leadId, organizationId: principal.organizationId, status: 'PENDING' },
        orderBy: { dueAt: 'asc' },
      });
      await tx.lead.update({
        where: { id: leadId },
        data: { nextFollowUpAt: next?.dueAt ?? dueAt, lastActivityAt: now },
      });
      await tx.leadActivity.create({
        data: {
          organizationId: principal.organizationId,
          leadId,
          type: 'FOLLOW_UP',
          title: 'Follow-up scheduled',
          description: dto.notes,
          occurredAt: now,
          createdById: principal.userId,
          metadata: { followUpId: followUp.id, dueAt: dueAt.toISOString() },
        },
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'FOLLOW_UP',
          entityId: followUp.id,
          action: 'FOLLOW_UP_CREATED',
        },
      });
      return followUp;
    });
  }

  async rescheduleFollowUp(
    principal: AuthenticatedPrincipal,
    leadId: string,
    id: string,
    dto: RescheduleFollowUpDto,
  ) {
    const existing = await this.requireFollowUp(principal, leadId, id);
    if (existing.status !== 'PENDING')
      throw new ConflictException('Only pending follow-ups can be rescheduled');
    await this.validateRelationships(
      principal.organizationId,
      undefined,
      undefined,
      dto.assignedToId,
    );
    return this.prisma.$transaction(async (tx) => {
      const dueAt = new Date(dto.dueAt);
      const now = new Date();
      const followUp = await tx.followUp.update({
        where: { id },
        data: { ...dto, dueAt },
        include: { assignedTo: { select: userSelect } },
      });
      const next = await tx.followUp.findFirst({
        where: { leadId, organizationId: principal.organizationId, status: 'PENDING' },
        orderBy: { dueAt: 'asc' },
      });
      await tx.lead.update({
        where: { id: leadId },
        data: { nextFollowUpAt: next?.dueAt ?? dueAt, lastActivityAt: now },
      });
      await tx.leadActivity.create({
        data: {
          organizationId: principal.organizationId,
          leadId,
          type: 'FOLLOW_UP',
          title: 'Follow-up rescheduled',
          description: dto.notes,
          occurredAt: now,
          createdById: principal.userId,
          metadata: {
            followUpId: id,
            fromDueAt: existing.dueAt.toISOString(),
            toDueAt: dueAt.toISOString(),
          },
        },
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'FOLLOW_UP',
          entityId: id,
          action: 'FOLLOW_UP_RESCHEDULED',
          metadata: {
            fromDueAt: existing.dueAt.toISOString(),
            toDueAt: dueAt.toISOString(),
          },
        },
      });
      return followUp;
    });
  }

  async completeFollowUp(principal: AuthenticatedPrincipal, leadId: string, id: string) {
    return this.finishFollowUp(principal, leadId, id, 'COMPLETED');
  }
  async cancelFollowUp(principal: AuthenticatedPrincipal, leadId: string, id: string) {
    return this.finishFollowUp(principal, leadId, id, 'CANCELLED');
  }

  async listFollowUps(principal: AuthenticatedPrincipal, query: FollowUpListQueryDto) {
    if (query.scope && !['today', 'overdue', 'upcoming', 'all'].includes(query.scope))
      throw new BadRequestException('Unsupported follow-up scope');
    if (query.lead && !isUUID(query.lead)) throw new BadRequestException('lead must be a UUID');
    const mine = query.mine as unknown;
    if (
      mine !== undefined &&
      mine !== true &&
      mine !== false &&
      mine !== 'true' &&
      mine !== 'false'
    )
      throw new BadRequestException('mine must be true or false');
    const listQuery = normalizeListQuery(query, 'dueAt', ['dueAt', 'createdAt']);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dueAt =
      query.scope === 'today'
        ? { gte: start, lt: end }
        : query.scope === 'overdue'
          ? { lt: start }
          : query.scope === 'upcoming'
            ? { gte: end }
            : undefined;
    const where: Prisma.FollowUpWhereInput = {
      organizationId: principal.organizationId,
      status: 'PENDING',
      ...(dueAt ? { dueAt } : {}),
      ...(mine === true || mine === 'true' ? { assignedToId: principal.userId } : {}),
      ...(query.lead ? { leadId: query.lead } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.followUp.findMany({
        where,
        include: {
          assignedTo: { select: userSelect },
          lead: {
            select: { id: true, title: true, company: { select: { id: true, name: true } } },
          },
        },
        orderBy: { [listQuery.sort]: listQuery.order },
        skip: (listQuery.page - 1) * listQuery.limit,
        take: listQuery.limit,
      }),
      this.prisma.followUp.count({ where }),
    ]);
    return { data, meta: paginationMeta(listQuery.page, listQuery.limit, total) };
  }

  private async finishFollowUp(
    principal: AuthenticatedPrincipal,
    leadId: string,
    id: string,
    status: 'COMPLETED' | 'CANCELLED',
  ) {
    const existing = await this.requireFollowUp(principal, leadId, id);
    if (existing.status !== 'PENDING')
      throw new ConflictException('Follow-up is no longer pending');
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const followUp = await tx.followUp.update({
        where: { id },
        data: { status, ...(status === 'COMPLETED' ? { completedAt: now } : { cancelledAt: now }) },
        include: { assignedTo: { select: userSelect } },
      });
      const next = await tx.followUp.findFirst({
        where: {
          leadId,
          organizationId: principal.organizationId,
          status: 'PENDING',
          id: { not: id },
        },
        orderBy: { dueAt: 'asc' },
      });
      await tx.lead.update({
        where: { id: leadId },
        data: { nextFollowUpAt: next?.dueAt ?? null, lastActivityAt: now },
      });
      await tx.leadActivity.create({
        data: {
          organizationId: principal.organizationId,
          leadId,
          type: 'FOLLOW_UP',
          title: `Follow-up ${status === 'COMPLETED' ? 'completed' : 'cancelled'}`,
          occurredAt: now,
          createdById: principal.userId,
          metadata: { followUpId: id },
        },
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'FOLLOW_UP',
          entityId: id,
          action: `FOLLOW_UP_${status}`,
        },
      });
      return followUp;
    });
  }

  private async requireLead(principal: AuthenticatedPrincipal, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: leadInclude,
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.archivedAt) throw new ConflictException('Archived leads cannot be modified');
    return lead;
  }
  private async requireFollowUp(principal: AuthenticatedPrincipal, leadId: string, id: string) {
    const followUp = await this.prisma.followUp.findFirst({
      where: { id, leadId, organizationId: principal.organizationId },
    });
    if (!followUp) throw new NotFoundException('Follow-up not found');
    return followUp;
  }
  private async validateRelationships(
    organizationId: string,
    companyId?: string | null,
    contactId?: string | null,
    ownerId?: string | null,
  ) {
    const [company, contact, owner] = await Promise.all([
      companyId
        ? this.prisma.company.findFirst({
            where: { id: companyId, organizationId, archivedAt: null },
          })
        : null,
      contactId
        ? this.prisma.contact.findFirst({
            where: { id: contactId, organizationId, archivedAt: null },
          })
        : null,
      ownerId
        ? this.prisma.user.findFirst({ where: { id: ownerId, organizationId, status: 'ACTIVE' } })
        : null,
    ]);
    if (companyId && !company) throw new BadRequestException('Company is invalid or unavailable');
    if (contactId && !contact) throw new BadRequestException('Contact is invalid or unavailable');
    if (ownerId && !owner) throw new BadRequestException('Owner is invalid or unavailable');
    if (companyId && contact?.companyId && contact.companyId !== companyId)
      throw new BadRequestException('Contact does not belong to the selected company');
  }
}
