import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AutomationsService } from '../automations/automations.service';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { PrismaService } from '../database/prisma.service';
import { PipelinesService } from '../pipelines/pipelines.service';
import { TagsService } from '../tags/tags.service';
import type {
  CreateDealDto,
  CreateDealProjectDto,
  DealListQueryDto,
  UpdateDealDto,
  UpdateDealOwnerDto,
  UpdateDealItemsDto,
  UpdateDealStageDto,
} from './dto/deals.dto';

const userSelect = { id: true, firstName: true, lastName: true } as const;
const dealInclude = {
  company: { select: { id: true, name: true, status: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  owner: { select: userSelect },
  pipeline: { select: { id: true, name: true, entityType: true } },
  stage: { select: { id: true, name: true, position: true, isWon: true, isLost: true } },
} as const;

function intersectIds(first?: string[], second?: string[]) {
  if (!first) return second;
  if (!second) return first;
  const set = new Set(second);
  return first.filter((id) => set.has(id));
}

@Injectable()
export class DealsService {
  constructor(
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService,
    @Inject(PipelinesService) private readonly pipelines: PipelinesService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TagsService) private readonly tags: TagsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: DealListQueryDto) {
    const listQuery = normalizeListQuery(query, 'createdAt', [
      'name',
      'amount',
      'probability',
      'expectedCloseDate',
      'createdAt',
      'updatedAt',
    ]);
    if (query.closeFrom && query.closeTo && new Date(query.closeFrom) > new Date(query.closeTo))
      throw new BadRequestException('closeFrom must not be after closeTo');
    const recordIds = intersectIds(
      await this.tags.matchingEntityIds(principal.organizationId, 'DEAL', query.tag),
      await this.customFields.matchingEntityIds(
        principal.organizationId,
        'DEAL',
        query.customFields,
      ),
    );
    const where: Prisma.DealWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(recordIds ? { id: { in: recordIds } } : {}),
      ...(query.pipeline ? { pipelineId: query.pipeline } : {}),
      ...(query.stage ? { stageId: query.stage } : {}),
      ...(query.owner ? { ownerId: query.owner } : {}),
      ...(query.company ? { companyId: query.company } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.view === 'mine' ? { ownerId: principal.userId } : {}),
      ...(query.view === 'open' ? { stage: { isWon: false, isLost: false } } : {}),
      ...(query.view === 'won' ? { stage: { isWon: true } } : {}),
      ...(query.view === 'lost' ? { stage: { isLost: true } } : {}),
      ...(query.closeFrom || query.closeTo
        ? {
            expectedCloseDate: {
              ...(query.closeFrom ? { gte: new Date(query.closeFrom) } : {}),
              ...(query.closeTo ? { lte: new Date(query.closeTo) } : {}),
            },
          }
        : {}),
      ...(listQuery.search
        ? {
            OR: [
              { name: { contains: listQuery.search, mode: 'insensitive' } },
              { company: { name: { contains: listQuery.search, mode: 'insensitive' } } },
              { contact: { firstName: { contains: listQuery.search, mode: 'insensitive' } } },
              { contact: { lastName: { contains: listQuery.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({
        where,
        include: dealInclude,
        orderBy: { [listQuery.sort]: listQuery.order },
        skip: (listQuery.page - 1) * listQuery.limit,
        take: listQuery.limit,
      }),
      this.prisma.deal.count({ where }),
    ]);
    return {
      data: await this.decorate(principal.organizationId, data),
      meta: paginationMeta(listQuery.page, listQuery.limit, total),
    };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: {
        ...dealInclude,
        sourceLead: { select: { id: true, title: true } },
        quotations: {
          where: { archivedAt: null },
          select: { id: true, quotationNumber: true, status: true, total: true, currency: true },
          orderBy: { createdAt: 'desc' },
        },
        project: { select: { id: true, name: true, status: true, archivedAt: true } },
        items: {
          orderBy: { position: 'asc' },
          include: {
            catalogItem: { select: { id: true, name: true, active: true, archivedAt: true } },
          },
        },
      },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    const activities = await this.prisma.activityLog.findMany({
      where: { organizationId: principal.organizationId, entityType: 'DEAL', entityId: id },
      include: { actor: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return (await this.decorate(principal.organizationId, [{ ...deal, activities }]))[0];
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateDealDto) {
    this.customFields.rejectGeneratedControlKeys(dto);
    if (dto.ownerId && !principal.permissions.includes(PERMISSIONS.dealAssign))
      throw new ForbiddenException('Insufficient permission to assign deal owner');
    const pipeline = await this.resolvePipeline(
      principal.organizationId,
      dto.pipelineId,
      dto.stageId,
    );
    await this.validateRelationships(
      principal.organizationId,
      dto.companyId,
      dto.contactId,
      dto.ownerId,
    );
    const { customFields, tagIds, expectedCloseDate } = dto;
    const input = { ...dto };
    delete input.customFields;
    delete input.tagIds;
    delete input.pipelineId;
    delete input.stageId;
    delete input.expectedCloseDate;
    const deal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: {
          ...input,
          organizationId: principal.organizationId,
          createdById: principal.userId,
          pipelineId: pipeline.pipelineId,
          stageId: pipeline.stageId,
          expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
        },
        include: dealInclude,
      });
      await this.customFields.saveValues(
        tx,
        principal.organizationId,
        'DEAL',
        created.id,
        customFields,
        true,
      );
      await this.tags.sync(tx, principal.organizationId, 'DEAL', created.id, tagIds);
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'DEAL',
          entityId: created.id,
          action: 'DEAL_CREATED',
        },
      });
      return created;
    });
    await this.automations.publishBusinessEvent(
      principal.organizationId,
      'deal.created',
      deal.id,
      this.eventData(deal),
    );
    return (await this.decorate(principal.organizationId, [deal]))[0];
  }

  async updateItems(principal: AuthenticatedPrincipal, id: string, dto: UpdateDealItemsDto) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId: principal.organizationId, archivedAt: null },
      select: { id: true, currency: true },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    const ids = [...new Set(dto.items.map((item) => item.catalogItemId))];
    const catalogItems = ids.length
      ? await this.prisma.catalogItem.findMany({
          where: {
            id: { in: ids },
            organizationId: principal.organizationId,
            active: true,
            archivedAt: null,
          },
          select: { id: true, name: true, currency: true },
        })
      : [];
    if (catalogItems.length !== ids.length)
      throw new BadRequestException('One or more catalog items are unavailable');
    if (catalogItems.some((item) => item.currency !== deal.currency))
      throw new BadRequestException('Catalog item currency must match deal currency');
    const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
    const normalized = dto.items.map((item, position) => {
      const quantity = new Prisma.Decimal(item.quantity);
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      if (quantity.lessThanOrEqualTo(0))
        throw new BadRequestException('Deal item quantity must be greater than zero');
      return {
        organizationId: principal.organizationId,
        dealId: id,
        catalogItemId: item.catalogItemId,
        itemName: catalogById.get(item.catalogItemId)!.name,
        quantity,
        unitPrice,
        amount: quantity.times(unitPrice).toDecimalPlaces(2),
        position,
      };
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.dealItem.deleteMany({
        where: { dealId: id, organizationId: principal.organizationId },
      });
      if (normalized.length) await tx.dealItem.createMany({ data: normalized });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'DEAL',
          entityId: id,
          action: 'DEAL_ITEMS_UPDATED',
          metadata: { itemCount: normalized.length },
        },
      });
    });
    return this.get(principal, id);
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateDealDto) {
    this.customFields.rejectGeneratedControlKeys(dto);
    const existing = await this.requireDeal(principal.organizationId, id);
    await this.validateRelationships(
      principal.organizationId,
      dto.companyId ?? existing.companyId,
      dto.contactId !== undefined ? dto.contactId : existing.contactId,
      dto.ownerId !== undefined ? dto.ownerId : existing.ownerId,
    );
    if (
      dto.ownerId !== undefined &&
      dto.ownerId !== existing.ownerId &&
      !principal.permissions.includes(PERMISSIONS.dealAssign)
    )
      throw new ForbiddenException('Insufficient permission to assign deal owner');
    const { customFields, tagIds, pipelineId, stageId, expectedCloseDate, ...input } = dto;
    if (pipelineId !== undefined || stageId !== undefined)
      throw new BadRequestException('Use the deal stage endpoint to change pipeline or stage');
    const deal = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.deal.update({
        where: { id },
        data: {
          ...input,
          ...(expectedCloseDate !== undefined
            ? { expectedCloseDate: new Date(expectedCloseDate) }
            : {}),
        },
        include: dealInclude,
      });
      await this.customFields.saveValues(
        tx,
        principal.organizationId,
        'DEAL',
        id,
        customFields,
        false,
      );
      await this.tags.sync(tx, principal.organizationId, 'DEAL', id, tagIds);
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'DEAL',
          entityId: id,
          action: 'DEAL_UPDATED',
        },
      });
      return updated;
    });
    return (await this.decorate(principal.organizationId, [deal]))[0];
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    await this.requireDeal(principal.organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const deal = await tx.deal.update({
        where: { id },
        data: { archivedAt: new Date() },
        include: dealInclude,
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'DEAL',
          entityId: id,
          action: 'DEAL_ARCHIVED',
        },
      });
      return deal;
    });
  }

  async changeStage(principal: AuthenticatedPrincipal, id: string, dto: UpdateDealStageDto) {
    const existing = await this.requireDeal(principal.organizationId, id);
    const pipelineId = dto.pipelineId ?? existing.pipelineId;
    const stage = await this.prisma.pipelineStage.findFirst({
      where: {
        id: dto.stageId,
        organizationId: principal.organizationId,
        pipelineId,
        pipeline: { entityType: 'DEAL', archivedAt: null },
      },
    });
    if (!stage) throw new BadRequestException('Deal pipeline stage is invalid or unavailable');
    if (stage.isLost && !dto.lostReason)
      throw new BadRequestException('A lost reason is required when marking a deal lost');
    if (stage.id === existing.stageId && pipelineId === existing.pipelineId) return existing;
    const now = new Date();
    const deal = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.deal.update({
        where: { id },
        data: {
          pipelineId,
          stageId: stage.id,
          lostReason: stage.isLost ? dto.lostReason : null,
          wonAt: stage.isWon ? now : null,
          lostAt: stage.isLost ? now : null,
        },
        include: dealInclude,
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'DEAL',
          entityId: id,
          action: stage.isWon ? 'DEAL_WON' : stage.isLost ? 'DEAL_LOST' : 'DEAL_STAGE_CHANGED',
          metadata: {
            fromPipelineId: existing.pipelineId,
            toPipelineId: pipelineId,
            fromStageId: existing.stageId,
            toStageId: stage.id,
          },
        },
      });
      return updated;
    });
    await this.automations.publishBusinessEvent(
      principal.organizationId,
      'deal.stage_changed',
      deal.id,
      { ...this.eventData(deal), fromStageId: existing.stageId, toStageId: deal.stageId },
    );
    if (stage.isWon)
      await this.automations.publishBusinessEvent(
        principal.organizationId,
        'deal.won',
        deal.id,
        this.eventData(deal),
      );
    if (stage.isLost)
      await this.automations.publishBusinessEvent(
        principal.organizationId,
        'deal.lost',
        deal.id,
        this.eventData(deal),
      );
    return deal;
  }

  async changeOwner(principal: AuthenticatedPrincipal, id: string, dto: UpdateDealOwnerDto) {
    const existing = await this.requireDeal(principal.organizationId, id);
    if (dto.ownerId === existing.ownerId) return existing;
    await this.validateRelationships(
      principal.organizationId,
      existing.companyId,
      existing.contactId,
      dto.ownerId,
    );
    const deal = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.deal.update({
        where: { id },
        data: { ownerId: dto.ownerId },
        include: dealInclude,
      });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'DEAL',
          entityId: id,
          action: 'DEAL_OWNER_CHANGED',
          metadata: { fromOwnerId: existing.ownerId, toOwnerId: dto.ownerId },
        },
      });
      return updated;
    });
    await this.automations.publishBusinessEvent(
      principal.organizationId,
      'deal.owner_changed',
      deal.id,
      { ...this.eventData(deal), fromOwnerId: existing.ownerId, toOwnerId: deal.ownerId },
    );
    return deal;
  }

  async createProject(principal: AuthenticatedPrincipal, id: string, dto: CreateDealProjectDto) {
    const deal = await this.requireDeal(principal.organizationId, id);
    if (!deal.stage.isWon)
      throw new ConflictException('Only a won deal can be converted to a project');
    const existing = await this.prisma.project.findFirst({
      where: { organizationId: principal.organizationId, sourceDealId: id },
    });
    if (existing) throw new ConflictException('A project already exists for this deal');
    if (dto.projectManagerId)
      await this.validateRelationships(
        principal.organizationId,
        deal.companyId,
        deal.contactId,
        dto.projectManagerId,
      );
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          organizationId: principal.organizationId,
          companyId: deal.companyId,
          sourceDealId: deal.id,
          name: dto.name ?? deal.name,
          description: dto.description ?? deal.description,
          projectManagerId: dto.projectManagerId ?? deal.ownerId,
          status: dto.status,
          priority: dto.priority,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          deadline: dto.deadline ? new Date(dto.deadline) : undefined,
          projectValue: deal.amount,
          currency: deal.currency,
          createdById: principal.userId,
        },
      });
      const managerId = dto.projectManagerId ?? deal.ownerId;
      if (managerId)
        await tx.projectMember.create({
          data: {
            organizationId: principal.organizationId,
            projectId: created.id,
            userId: managerId,
            role: 'Project manager',
          },
        });
      await tx.activityLog.create({
        data: {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'DEAL',
          entityId: id,
          action: 'DEAL_PROJECT_CREATED',
          metadata: { projectId: created.id },
        },
      });
      return created;
    });
    await this.automations.publishBusinessEvent(
      principal.organizationId,
      'project.created',
      project.id,
      {
        name: project.name,
        status: project.status,
        ownerId: project.projectManagerId,
        sourceDealId: id,
      },
    );
    return project;
  }

  private async resolvePipeline(organizationId: string, pipelineId?: string, stageId?: string) {
    if ((pipelineId && !stageId) || (!pipelineId && stageId))
      throw new BadRequestException('pipelineId and stageId must be selected together');
    const pipeline = pipelineId
      ? await this.prisma.pipeline.findFirst({
          where: { id: pipelineId, organizationId, entityType: 'DEAL', archivedAt: null },
          include: { stages: { orderBy: { position: 'asc' } } },
        })
      : await this.pipelines.ensureDefault(organizationId, 'DEAL');
    if (!pipeline) throw new BadRequestException('Deal pipeline is invalid or unavailable');
    const stage = stageId ? pipeline.stages.find(({ id }) => id === stageId) : pipeline.stages[0];
    if (!stage) throw new ConflictException('The selected deal pipeline has no valid stage');
    return { pipelineId: pipeline.id, stageId: stage.id };
  }

  private async requireDeal(organizationId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId, archivedAt: null },
      include: dealInclude,
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  private async validateRelationships(
    organizationId: string,
    companyId: string,
    contactId?: string | null,
    ownerId?: string | null,
  ) {
    const [company, contact, owner] = await Promise.all([
      this.prisma.company.findFirst({
        where: { id: companyId, organizationId, archivedAt: null },
        select: { id: true },
      }),
      contactId
        ? this.prisma.contact.findFirst({
            where: { id: contactId, organizationId, archivedAt: null },
            select: { id: true, companyId: true },
          })
        : null,
      ownerId
        ? this.prisma.user.findFirst({
            where: { id: ownerId, organizationId, status: 'ACTIVE' },
            select: { id: true },
          })
        : null,
    ]);
    if (!company) throw new BadRequestException('Company is invalid or unavailable');
    if (contactId && !contact) throw new BadRequestException('Contact is invalid or unavailable');
    if (contact && contact.companyId && contact.companyId !== companyId)
      throw new BadRequestException('Contact does not belong to the selected company');
    if (ownerId && !owner) throw new BadRequestException('Owner is invalid or unavailable');
  }

  private eventData(deal: {
    name: string;
    stageId: string;
    pipelineId: string;
    ownerId: string | null;
    priority: string;
    amount: { toNumber(): number } | null;
  }) {
    return {
      name: deal.name,
      stageId: deal.stageId,
      pipelineId: deal.pipelineId,
      ownerId: deal.ownerId,
      priority: deal.priority,
      amount: deal.amount?.toNumber() ?? null,
    };
  }

  private async decorate<T extends { id: string }>(organizationId: string, records: T[]) {
    return this.tags.decorate(
      organizationId,
      'DEAL',
      await this.customFields.decorate(organizationId, 'DEAL', records),
    );
  }
}
