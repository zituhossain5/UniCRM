import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { TagsService } from '../tags/tags.service';
import { IntegrationsService } from '../integrations/integrations.service';
import type {
  AddProjectMemberDto,
  CreateProjectDto,
  ProjectListQueryDto,
  UpdateProjectDto,
} from './dto/projects.dto';

const userSelect = { id: true, firstName: true, lastName: true, status: true } as const;
const projectListInclude = {
  company: { select: { id: true, name: true, status: true } },
  projectManager: { select: userSelect },
  _count: { select: { members: true, tasks: { where: { archivedAt: null } } } },
} satisfies Prisma.ProjectInclude;

const projectInclude = {
  ...projectListInclude,
  sourceLead: {
    select: {
      id: true,
      title: true,
      estimatedValue: true,
      currency: true,
      stage: { select: { isWon: true, name: true } },
    },
  },
  createdBy: { select: userSelect },
  members: {
    include: { user: { select: userSelect } },
    orderBy: { createdAt: 'asc' },
  },
  quotations: {
    where: { archivedAt: null },
    select: { id: true, quotationNumber: true, status: true, total: true, currency: true },
    orderBy: { createdAt: 'desc' },
  },
  payments: {
    where: { archivedAt: null },
    select: {
      id: true,
      amount: true,
      currency: true,
      paymentDate: true,
      method: true,
      reference: true,
    },
    orderBy: { paymentDate: 'desc' },
  },
} satisfies Prisma.ProjectInclude;

function dateOnly(value: string | null | undefined) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : undefined;
}

function intersectIds(first?: string[], second?: string[]) {
  if (!first) return second;
  if (!second) return first;
  const set = new Set(second);
  return first.filter((id) => set.has(id));
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TagsService) private readonly tags: TagsService,
    @Inject(IntegrationsService) private readonly integrations: IntegrationsService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: ProjectListQueryDto) {
    const listQuery = normalizeListQuery(query, 'createdAt', [
      'name',
      'createdAt',
      'updatedAt',
      'deadline',
      'status',
      'priority',
      'progress',
    ]);
    const recordIds = intersectIds(
      await this.tags.matchingEntityIds(principal.organizationId, 'PROJECT', query.tag),
      await this.customFields.matchingEntityIds(
        principal.organizationId,
        'PROJECT',
        query.customFields,
      ),
    );
    const where: Prisma.ProjectWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(recordIds ? { id: { in: recordIds } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.manager ? { projectManagerId: query.manager } : {}),
      ...(query.company ? { companyId: query.company } : {}),
      ...(query.deadline ? { deadline: dateOnly(query.deadline) } : {}),
      ...(query.view === 'active' ? { status: { in: ['IN_PROGRESS', 'IN_REVIEW'] } } : {}),
      ...(query.view === 'planned' ? { status: 'PLANNED' } : {}),
      ...(query.view === 'onHold' ? { status: 'ON_HOLD' } : {}),
      ...(query.view === 'completed' ? { status: 'COMPLETED' } : {}),
      ...(listQuery.search
        ? {
            OR: [
              { name: { contains: listQuery.search, mode: 'insensitive' } },
              { company: { name: { contains: listQuery.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy = { [listQuery.sort]: listQuery.order } as Prisma.ProjectOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: projectListInclude,
        orderBy,
        skip: (listQuery.page - 1) * listQuery.limit,
        take: listQuery.limit,
      }),
      this.prisma.project.count({ where }),
    ]);
    return {
      data: await this.decorate(principal.organizationId, data),
      meta: paginationMeta(listQuery.page, listQuery.limit, total),
    };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: projectInclude,
    });
    if (!project) throw new NotFoundException('Project not found');
    const [activity, quotedAggregate, paymentAggregate] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where: { organizationId: principal.organizationId, entityType: 'PROJECT', entityId: id },
        include: { actor: { select: userSelect } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.quotation.aggregate({
        where: {
          organizationId: principal.organizationId,
          projectId: id,
          archivedAt: null,
          status: { in: ['SENT', 'ACCEPTED'] },
        },
        _sum: { total: true },
      }),
      this.prisma.payment.aggregate({
        where: { organizationId: principal.organizationId, projectId: id, archivedAt: null },
        _sum: { amount: true },
      }),
    ]);
    const received = paymentAggregate._sum.amount ?? new Prisma.Decimal(0);
    const projectValue = project.projectValue ?? new Prisma.Decimal(0);
    const result = {
      ...project,
      financials: {
        projectValue,
        quotedAmount: quotedAggregate._sum.total ?? new Prisma.Decimal(0),
        received,
        outstanding: projectValue.minus(received).toDecimalPlaces(2),
      },
      activity,
    };
    return (await this.decorate(principal.organizationId, [result]))[0];
  }

  listUsers(principal: AuthenticatedPrincipal) {
    return this.prisma.user.findMany({
      where: { organizationId: principal.organizationId, status: 'ACTIVE' },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: userSelect,
    });
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateProjectDto) {
    this.customFields.rejectGeneratedControlKeys(dto);
    await this.validateCompany(principal.organizationId, dto.companyId);
    await this.validateManager(principal.organizationId, dto.projectManagerId);
    await this.validateSourceLead(principal.organizationId, dto.sourceLeadId, dto.companyId);
    this.validateDates(dto.startDate, dto.deadline);
    const { startDate, deadline, currency, customFields, tagIds, ...input } = dto;
    try {
      const project = await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            ...input,
            currency: currency?.toUpperCase(),
            startDate: dateOnly(startDate),
            deadline: dateOnly(deadline),
            organizationId: principal.organizationId,
            createdById: principal.userId,
            ...(dto.projectManagerId
              ? {
                  members: {
                    create: {
                      organizationId: principal.organizationId,
                      userId: dto.projectManagerId,
                      role: 'Project Manager',
                    },
                  },
                }
              : {}),
          },
          include: projectInclude,
        });
        await this.customFields.saveValues(
          tx,
          principal.organizationId,
          'PROJECT',
          project.id,
          customFields,
          true,
        );
        await this.tags.sync(tx, principal.organizationId, 'PROJECT', project.id, tagIds);
        await this.audit.create(
          {
            action: 'PROJECT_CREATED',
            actorId: principal.userId,
            entityId: project.id,
            entityType: 'PROJECT',
            organizationId: principal.organizationId,
            metadata: dto.sourceLeadId ? { sourceLeadId: dto.sourceLeadId } : undefined,
          },
          tx,
        );
        return project;
      });
      await this.integrations.publishBusinessEvent(
        principal.organizationId,
        'project.created',
        project.id,
        {
          name: project.name,
          status: project.status,
          companyId: project.companyId,
        },
      );
      return (await this.decorate(principal.organizationId, [project]))[0];
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'P2002')
        throw new ConflictException('A project has already been created from this lead');
      throw cause;
    }
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateProjectDto) {
    this.customFields.rejectGeneratedControlKeys(dto);
    const existing = await this.requireActive(principal.organizationId, id);
    const companyId = dto.companyId ?? existing.companyId;
    if (dto.companyId) await this.validateCompany(principal.organizationId, dto.companyId);
    if (dto.projectManagerId !== undefined)
      await this.validateManager(principal.organizationId, dto.projectManagerId);
    if (dto.sourceLeadId !== undefined)
      await this.validateSourceLead(principal.organizationId, dto.sourceLeadId, companyId);
    const existingStartDate: Date | null = existing.startDate;
    const existingDeadline: Date | null = existing.deadline;
    const finalStartDate =
      dto.startDate === undefined ? existingStartDate : dateOnly(dto.startDate);
    const finalDeadline = dto.deadline === undefined ? existingDeadline : dateOnly(dto.deadline);
    if (finalStartDate && finalDeadline && finalStartDate > finalDeadline)
      throw new BadRequestException('startDate must not be after deadline');
    const { startDate, deadline, currency, customFields, tagIds, ...input } = dto;
    const project = await this.prisma.$transaction(async (tx) => {
      if (
        dto.projectManagerId !== undefined &&
        dto.projectManagerId !== existing.projectManagerId
      ) {
        if (existing.projectManagerId) {
          await tx.projectMember.updateMany({
            where: {
              projectId: id,
              userId: existing.projectManagerId,
              role: 'Project Manager',
            },
            data: { role: null },
          });
        }
        if (dto.projectManagerId) {
          await tx.projectMember.upsert({
            where: { projectId_userId: { projectId: id, userId: dto.projectManagerId } },
            create: {
              organizationId: principal.organizationId,
              projectId: id,
              userId: dto.projectManagerId,
              role: 'Project Manager',
            },
            update: { role: 'Project Manager' },
          });
        }
      }
      const project = await tx.project.update({
        where: { id },
        data: {
          ...input,
          ...(currency ? { currency: currency.toUpperCase() } : {}),
          ...(startDate !== undefined
            ? { startDate: startDate === null ? null : dateOnly(startDate) }
            : {}),
          ...(deadline !== undefined
            ? { deadline: deadline === null ? null : dateOnly(deadline) }
            : {}),
        },
        include: projectInclude,
      });
      await this.customFields.saveValues(
        tx,
        principal.organizationId,
        'PROJECT',
        id,
        customFields,
        false,
      );
      await this.tags.sync(tx, principal.organizationId, 'PROJECT', id, tagIds);
      await this.audit.create(
        {
          action: 'PROJECT_UPDATED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'PROJECT',
          organizationId: principal.organizationId,
          metadata: {
            ...(dto.status && dto.status !== existing.status
              ? { status: { from: existing.status, to: dto.status } }
              : {}),
            ...(dto.projectManagerId !== undefined &&
            dto.projectManagerId !== existing.projectManagerId
              ? {
                  projectManagerId: {
                    from: existing.projectManagerId,
                    to: dto.projectManagerId,
                  },
                }
              : {}),
            ...(dto.deadline !== undefined &&
            dateOnly(dto.deadline)?.getTime() !== existing.deadline?.getTime()
              ? { deadline: { from: existing.deadline, to: dto.deadline } }
              : {}),
          },
        },
        tx,
      );
      return project;
    });
    await this.integrations.publishBusinessEvent(
      principal.organizationId,
      'project.updated',
      project.id,
      {
        name: project.name,
        status: project.status,
        companyId: project.companyId,
      },
    );
    return (await this.decorate(principal.organizationId, [project]))[0];
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    await this.requireActive(principal.organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: { archivedAt: new Date() },
        include: projectInclude,
      });
      await this.audit.create(
        {
          action: 'PROJECT_ARCHIVED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'PROJECT',
          organizationId: principal.organizationId,
        },
        tx,
      );
      return project;
    });
  }

  async listMembers(principal: AuthenticatedPrincipal, projectId: string) {
    await this.requireProject(principal.organizationId, projectId);
    return this.prisma.projectMember.findMany({
      where: { organizationId: principal.organizationId, projectId },
      include: { user: { select: userSelect } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMember(principal: AuthenticatedPrincipal, projectId: string, dto: AddProjectMemberDto) {
    await this.requireActive(principal.organizationId, projectId);
    await this.validateManager(principal.organizationId, dto.userId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const member = await tx.projectMember.create({
          data: { ...dto, organizationId: principal.organizationId, projectId },
          include: { user: { select: userSelect } },
        });
        await this.audit.create(
          {
            action: 'PROJECT_MEMBER_ADDED',
            actorId: principal.userId,
            entityId: projectId,
            entityType: 'PROJECT',
            organizationId: principal.organizationId,
            metadata: { role: dto.role, userId: dto.userId },
          },
          tx,
        );
        return member;
      });
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'P2002')
        throw new ConflictException('This user is already a project member');
      throw cause;
    }
  }

  async removeMember(principal: AuthenticatedPrincipal, projectId: string, userId: string) {
    const project = await this.requireActive(principal.organizationId, projectId);
    if (project.projectManagerId === userId)
      throw new ConflictException('Change the project manager before removing this member');
    const member = await this.prisma.projectMember.findFirst({
      where: { organizationId: principal.organizationId, projectId, userId },
    });
    if (!member) throw new NotFoundException('Project member not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.delete({ where: { id: member.id } });
      await this.audit.create(
        {
          action: 'PROJECT_MEMBER_REMOVED',
          actorId: principal.userId,
          entityId: projectId,
          entityType: 'PROJECT',
          organizationId: principal.organizationId,
          metadata: { userId },
        },
        tx,
      );
    });
  }

  private validateDates(startDate?: string | null, deadline?: string | null) {
    if (startDate && deadline && dateOnly(startDate)! > dateOnly(deadline)!)
      throw new BadRequestException('startDate must not be after deadline');
  }

  private async decorate<T extends { id: string }>(organizationId: string, records: T[]) {
    return this.tags.decorate(
      organizationId,
      'PROJECT',
      await this.customFields.decorate(organizationId, 'PROJECT', records),
    );
  }

  private async validateCompany(organizationId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
  }

  private async validateManager(organizationId: string, userId?: string | null) {
    if (!userId) return;
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Active organization user not found');
  }

  private async validateSourceLead(
    organizationId: string,
    sourceLeadId: string | null | undefined,
    companyId: string,
  ) {
    if (!sourceLeadId) return;
    const lead = await this.prisma.lead.findFirst({
      where: { id: sourceLeadId, organizationId, archivedAt: null },
      select: { companyId: true, stage: { select: { isWon: true } } },
    });
    if (!lead) throw new NotFoundException('Source lead not found');
    if (!lead.stage.isWon) throw new ConflictException('Only won leads can create projects');
    if (lead.companyId !== companyId)
      throw new BadRequestException('Project company must match the source lead company');
  }

  private async requireProject(organizationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
      select: { id: true, archivedAt: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async requireActive(
    organizationId: string,
    id: string,
  ): Promise<{
    archivedAt: Date | null;
    companyId: string;
    deadline: Date | null;
    id: string;
    projectManagerId: string | null;
    startDate: Date | null;
    status: string;
  }> {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        companyId: true,
        projectManagerId: true,
        status: true,
        startDate: true,
        deadline: true,
        archivedAt: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.archivedAt) throw new ConflictException('Archived projects cannot be modified');
    return project;
  }
}
