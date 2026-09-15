import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { AutomationsService } from '../automations/automations.service';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';
import type {
  CaseListQueryDto,
  CaseReportQueryDto,
  CreateCaseCommentDto,
  CreateCaseDto,
  CreateCaseTaskDto,
  UpdateCaseDto,
} from './dto/cases.dto';

const personSelect = { id: true, firstName: true, lastName: true, status: true } as const;
const caseInclude = {
  assignedUser: { select: personSelect },
  createdBy: { select: personSelect },
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  company: { select: { id: true, name: true } },
  lead: { select: { id: true, title: true } },
  deal: { select: { id: true, name: true } },
  sourceThread: { select: { id: true, subject: true } },
  _count: { select: { comments: true, tasks: true, attachments: true } },
} satisfies Prisma.CustomerCaseInclude;

const terminal = ['RESOLVED', 'CLOSED'] as const;
const waiting = ['WAITING_FOR_CUSTOMER', 'WAITING_INTERNAL'] as const;

@Injectable()
export class CasesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
    @Inject(TasksService) private readonly tasks: TasksService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: CaseListQueryDto) {
    const list = normalizeListQuery(query, 'updatedAt', [
      'caseNumber',
      'title',
      'status',
      'priority',
      'dueAt',
      'createdAt',
      'updatedAt',
    ]);
    const now = new Date();
    const where: Prisma.CustomerCaseWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(list.search
        ? {
            OR: [
              { caseNumber: { contains: list.search, mode: 'insensitive' } },
              { title: { contains: list.search, mode: 'insensitive' } },
              { description: { contains: list.search, mode: 'insensitive' } },
              { company: { name: { contains: list.search, mode: 'insensitive' } } },
              {
                contact: {
                  OR: [
                    { firstName: { contains: list.search, mode: 'insensitive' } },
                    { lastName: { contains: list.search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.assignee ? { assignedUserId: query.assignee } : {}),
      ...(query.company ? { companyId: query.company } : {}),
      ...(query.contact ? { contactId: query.contact } : {}),
      ...(query.lead ? { leadId: query.lead } : {}),
      ...(query.deal ? { dealId: query.deal } : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueAt: {
              ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
              ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
            },
          }
        : {}),
      ...(query.view === 'mine' ? { assignedUserId: principal.userId } : {}),
      ...(query.view === 'unassigned' ? { assignedUserId: null } : {}),
      ...(query.view === 'open' ? { status: { in: ['OPEN', 'IN_PROGRESS'] } } : {}),
      ...(query.view === 'waiting' ? { status: { in: [...waiting] } } : {}),
      ...(query.view === 'overdue' ? { dueAt: { lt: now }, status: { notIn: [...terminal] } } : {}),
      ...(query.view === 'resolved' ? { status: { in: [...terminal] } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customerCase.findMany({
        where,
        include: caseInclude,
        orderBy: { [list.sort]: list.order },
        skip: (list.page - 1) * list.limit,
        take: list.limit,
      }),
      this.prisma.customerCase.count({ where }),
    ]);
    return { data, meta: paginationMeta(list.page, list.limit, total) };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const record = await this.prisma.customerCase.findFirst({
      where: { id, organizationId: principal.organizationId, archivedAt: null },
      include: {
        ...caseInclude,
        comments: { include: { author: { select: personSelect } }, orderBy: { createdAt: 'asc' } },
        tasks: {
          where: { archivedAt: null },
          include: { assignee: { select: personSelect } },
          orderBy: { createdAt: 'desc' },
        },
        attachments: {
          include: { uploadedBy: { select: personSelect } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!record) throw new NotFoundException('Case not found');
    const activity = await this.prisma.activityLog.findMany({
      where: { organizationId: principal.organizationId, entityType: 'CASE', entityId: id },
      include: { actor: { select: personSelect } },
      orderBy: { createdAt: 'desc' },
    });
    return { ...record, activity };
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateCaseDto) {
    if (dto.assignedUserId && !principal.permissions.includes('case.assign'))
      throw new ForbiddenException('case.assign permission is required to assign a case');
    if (
      dto.status &&
      terminal.includes(dto.status as (typeof terminal)[number]) &&
      !principal.permissions.includes('case.resolve')
    )
      throw new ForbiddenException('case.resolve permission is required for this status');
    await this.validateReferences(principal.organizationId, dto);
    const record = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.customerCaseNumberCounter.upsert({
        where: { organizationId: principal.organizationId },
        create: { organizationId: principal.organizationId, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
        select: { nextNumber: true },
      });
      const number = counter.nextNumber - 1;
      const created = await tx.customerCase.create({
        data: {
          ...this.data(dto),
          caseNumber: `CS-${number.toString().padStart(6, '0')}`,
          organizationId: principal.organizationId,
          createdById: principal.userId,
          resolvedAt: dto.status === 'RESOLVED' ? new Date() : null,
          closedAt: dto.status === 'CLOSED' ? new Date() : null,
        },
        include: caseInclude,
      });
      await this.audit.create(
        {
          action: 'CASE_CREATED',
          actorId: principal.userId,
          entityId: created.id,
          entityType: 'CASE',
          organizationId: principal.organizationId,
          metadata: { caseNumber: created.caseNumber, sourceThreadId: created.sourceThreadId },
        },
        tx,
      );
      await this.notifyAssignment(created, principal.userId, tx);
      return created;
    });
    await this.publish(record, 'case.created');
    if (record.assignedUserId) await this.publish(record, 'case.assigned');
    return record;
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateCaseDto) {
    const existing = await this.requireActive(principal.organizationId, id);
    if (
      dto.assignedUserId !== undefined &&
      dto.assignedUserId !== existing.assignedUserId &&
      !principal.permissions.includes('case.assign')
    )
      throw new ForbiddenException('case.assign permission is required to change assignee');
    if (
      dto.status &&
      dto.status !== existing.status &&
      (terminal.includes(dto.status as (typeof terminal)[number]) ||
        terminal.includes(existing.status as (typeof terminal)[number])) &&
      !principal.permissions.includes('case.resolve')
    )
      throw new ForbiddenException('case.resolve permission is required for this status change');
    if (dto.status && dto.status !== existing.status)
      this.validateTransition(existing.status, dto.status);
    await this.validateReferences(principal.organizationId, dto);
    const now = new Date();
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerCase.update({
        where: { id },
        data: {
          ...this.data(dto),
          ...(dto.status === 'RESOLVED' ? { resolvedAt: now, closedAt: null } : {}),
          ...(dto.status === 'CLOSED' ? { closedAt: now } : {}),
          ...(dto.status && !terminal.includes(dto.status as (typeof terminal)[number])
            ? { resolvedAt: null, closedAt: null }
            : {}),
        },
        include: caseInclude,
      });
      if (dto.assignedUserId !== undefined && dto.assignedUserId !== existing.assignedUserId) {
        await this.audit.create(
          {
            action: 'CASE_ASSIGNED',
            actorId: principal.userId,
            entityId: id,
            entityType: 'CASE',
            organizationId: principal.organizationId,
            metadata: { from: existing.assignedUserId, to: updated.assignedUserId },
          },
          tx,
        );
        await this.notifyAssignment(updated, principal.userId, tx);
      }
      if (dto.status && dto.status !== existing.status) {
        const action =
          dto.status === 'RESOLVED'
            ? 'CASE_RESOLVED'
            : dto.status === 'CLOSED'
              ? 'CASE_CLOSED'
              : terminal.includes(existing.status as (typeof terminal)[number])
                ? 'CASE_REOPENED'
                : 'CASE_STATUS_CHANGED';
        await this.audit.create(
          {
            action,
            actorId: principal.userId,
            entityId: id,
            entityType: 'CASE',
            organizationId: principal.organizationId,
            metadata: { from: existing.status, to: dto.status },
          },
          tx,
        );
        if (action === 'CASE_REOPENED' && updated.assignedUserId)
          await this.notifications.create(
            {
              organizationId: principal.organizationId,
              userId: updated.assignedUserId,
              type: 'CASE_REOPENED',
              title: 'Case reopened',
              message: `${updated.caseNumber}: ${updated.title}`,
              entityType: 'CASE',
              entityId: id,
              dedupeKey: `case:${id}:reopened:${updated.updatedAt.toISOString()}`,
            },
            tx,
          );
      }
      if (dto.priority && dto.priority !== existing.priority)
        await this.audit.create(
          {
            action: 'CASE_PRIORITY_CHANGED',
            actorId: principal.userId,
            entityId: id,
            entityType: 'CASE',
            organizationId: principal.organizationId,
            metadata: { from: existing.priority, to: dto.priority },
          },
          tx,
        );
      if (dto.dueAt !== undefined && this.date(dto.dueAt)?.getTime() !== existing.dueAt?.getTime())
        await this.audit.create(
          {
            action: 'CASE_DUE_CHANGED',
            actorId: principal.userId,
            entityId: id,
            entityType: 'CASE',
            organizationId: principal.organizationId,
            metadata: { from: existing.dueAt?.toISOString() ?? null, to: dto.dueAt },
          },
          tx,
        );
      return updated;
    });
    if (dto.assignedUserId !== undefined && dto.assignedUserId !== existing.assignedUserId)
      await this.publish(record, 'case.assigned');
    if (dto.priority && dto.priority !== existing.priority)
      await this.publish(record, 'case.priority_changed');
    if (dto.status && dto.status !== existing.status) {
      await this.publish(record, 'case.status_changed');
      if (dto.status === 'RESOLVED') await this.publish(record, 'case.resolved');
    }
    return record;
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    await this.requireActive(principal.organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.customerCase.update({
        where: { id },
        data: { archivedAt: new Date() },
        include: caseInclude,
      });
      await this.audit.create(
        {
          action: 'CASE_ARCHIVED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'CASE',
          organizationId: principal.organizationId,
        },
        tx,
      );
      return record;
    });
  }

  async comment(principal: AuthenticatedPrincipal, id: string, dto: CreateCaseCommentDto) {
    await this.requireActive(principal.organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.customerCaseComment.create({
        data: {
          organizationId: principal.organizationId,
          caseId: id,
          authorUserId: principal.userId,
          content: dto.content,
        },
        include: { author: { select: personSelect } },
      });
      await this.audit.create(
        {
          action: 'CASE_COMMENT_ADDED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'CASE',
          organizationId: principal.organizationId,
          metadata: { commentId: comment.id },
        },
        tx,
      );
      return comment;
    });
  }

  async createTask(principal: AuthenticatedPrincipal, id: string, dto: CreateCaseTaskDto) {
    const customerCase = await this.requireActive(principal.organizationId, id);
    const task = await this.tasks.create(principal, {
      ...dto,
      caseId: id,
      description:
        dto.description ?? `Created from ${customerCase.caseNumber}: ${customerCase.title}`,
    });
    await this.audit.create({
      action: 'CASE_TASK_CREATED',
      actorId: principal.userId,
      entityId: id,
      entityType: 'CASE',
      organizationId: principal.organizationId,
      metadata: { taskId: task.id, title: task.title },
    });
    return task;
  }

  async metrics(principal: AuthenticatedPrincipal) {
    const base = { organizationId: principal.organizationId, archivedAt: null };
    const now = new Date();
    const [open, mine, overdue] = await this.prisma.$transaction([
      this.prisma.customerCase.count({ where: { ...base, status: { notIn: [...terminal] } } }),
      this.prisma.customerCase.count({
        where: { ...base, assignedUserId: principal.userId, status: { notIn: [...terminal] } },
      }),
      this.prisma.customerCase.count({
        where: { ...base, dueAt: { lt: now }, status: { notIn: [...terminal] } },
      }),
    ]);
    return { data: { open, mine, overdue } };
  }

  async reports(principal: AuthenticatedPrincipal, query: CaseReportQueryDto) {
    const where: Prisma.CustomerCaseWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.assignee ? { assignedUserId: query.assignee } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [status, priority, assignee, overdue, resolved, users] = await this.prisma.$transaction([
      this.prisma.customerCase.groupBy({
        by: ['status'],
        where,
        _count: true,
        orderBy: { status: 'asc' },
      }),
      this.prisma.customerCase.groupBy({
        by: ['priority'],
        where,
        _count: true,
        orderBy: { priority: 'asc' },
      }),
      this.prisma.customerCase.groupBy({
        by: ['assignedUserId'],
        where,
        _count: true,
        orderBy: { assignedUserId: 'asc' },
      }),
      this.prisma.customerCase.count({
        where: { ...where, dueAt: { lt: new Date() }, status: { notIn: [...terminal] } },
      }),
      this.prisma.customerCase.findMany({
        where: { ...where, resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
      }),
      this.prisma.user.findMany({
        where: { organizationId: principal.organizationId },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const durations = resolved.map((row) => row.resolvedAt!.getTime() - row.createdAt.getTime());
    const names = new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`]));
    return {
      data: {
        byStatus: status.map((x) => ({ status: x.status, count: x._count })),
        byPriority: priority.map((x) => ({ priority: x.priority, count: x._count })),
        byAssignee: assignee.map((x) => ({
          assignedUserId: x.assignedUserId,
          assignee: x.assignedUserId
            ? (names.get(x.assignedUserId) ?? 'Unavailable user')
            : 'Unassigned',
          count: x._count,
        })),
        overdue,
        resolutionTime: {
          resolvedCount: durations.length,
          averageHours: durations.length
            ? Number(
                (durations.reduce((a, b) => a + b, 0) / durations.length / 3_600_000).toFixed(1),
              )
            : null,
        },
      },
    };
  }

  private data(dto: CreateCaseDto | UpdateCaseDto) {
    const { dueAt, ...data } = dto;
    return { ...data, ...(dueAt !== undefined ? { dueAt: this.date(dueAt) } : {}) };
  }
  private date(value: string | null | undefined) {
    return value ? new Date(value) : value === null ? null : undefined;
  }

  private async validateReferences(organizationId: string, dto: CreateCaseDto | UpdateCaseDto) {
    const checks: Array<Promise<unknown>> = [];
    if (dto.contactId)
      checks.push(
        this.prisma.contact
          .findFirst({ where: { id: dto.contactId, organizationId, archivedAt: null } })
          .then((x) => x ?? Promise.reject(new BadRequestException('Contact is invalid'))),
      );
    if (dto.companyId)
      checks.push(
        this.prisma.company
          .findFirst({ where: { id: dto.companyId, organizationId, archivedAt: null } })
          .then((x) => x ?? Promise.reject(new BadRequestException('Company is invalid'))),
      );
    if (dto.leadId)
      checks.push(
        this.prisma.lead
          .findFirst({ where: { id: dto.leadId, organizationId, archivedAt: null } })
          .then((x) => x ?? Promise.reject(new BadRequestException('Lead is invalid'))),
      );
    if (dto.dealId)
      checks.push(
        this.prisma.deal
          .findFirst({ where: { id: dto.dealId, organizationId, archivedAt: null } })
          .then((x) => x ?? Promise.reject(new BadRequestException('Deal is invalid'))),
      );
    if (dto.sourceThreadId)
      checks.push(
        this.prisma.emailThread
          .findFirst({ where: { id: dto.sourceThreadId, organizationId } })
          .then((x) => x ?? Promise.reject(new BadRequestException('Email thread is invalid'))),
      );
    if (dto.assignedUserId)
      checks.push(
        this.prisma.user
          .findFirst({ where: { id: dto.assignedUserId, organizationId, status: 'ACTIVE' } })
          .then((x) => x ?? Promise.reject(new BadRequestException('Assignee is invalid'))),
      );
    await Promise.all(checks);
  }

  private async requireActive(organizationId: string, id: string) {
    const record = await this.prisma.customerCase.findFirst({
      where: { id, organizationId, archivedAt: null },
    });
    if (!record) throw new NotFoundException('Case not found');
    return record;
  }

  private validateTransition(from: string, to: string) {
    const allowed: Record<string, string[]> = {
      OPEN: ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED'],
      IN_PROGRESS: ['OPEN', 'WAITING_FOR_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED'],
      WAITING_FOR_CUSTOMER: ['OPEN', 'IN_PROGRESS', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED'],
      WAITING_INTERNAL: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'],
      RESOLVED: ['OPEN', 'IN_PROGRESS', 'CLOSED'],
      CLOSED: ['OPEN'],
    };
    if (!allowed[from]?.includes(to))
      throw new BadRequestException(`Cannot move a case from ${from} to ${to}`);
  }

  private async notifyAssignment(
    record: {
      id: string;
      organizationId: string;
      assignedUserId: string | null;
      caseNumber: string;
      title: string;
      priority: string;
      updatedAt: Date;
    },
    _actorId: string,
    tx: Prisma.TransactionClient,
  ) {
    if (!record.assignedUserId) return;
    await this.notifications.create(
      {
        organizationId: record.organizationId,
        userId: record.assignedUserId,
        type: 'CASE_ASSIGNED',
        title: record.priority === 'URGENT' ? 'Urgent case assigned' : 'Case assigned',
        message: `${record.caseNumber}: ${record.title}`,
        entityType: 'CASE',
        entityId: record.id,
        dedupeKey: `case:${record.id}:assigned:${record.assignedUserId}:${record.updatedAt.toISOString()}`,
      },
      tx,
    );
  }

  private publish(
    record: {
      id: string;
      organizationId: string;
      caseNumber: string;
      title: string;
      status: string;
      priority: string;
      assignedUserId: string | null;
    },
    event:
      | 'case.created'
      | 'case.assigned'
      | 'case.status_changed'
      | 'case.priority_changed'
      | 'case.resolved',
  ) {
    return this.automations.publishBusinessEvent(record.organizationId, event, record.id, {
      caseNumber: record.caseNumber,
      title: record.title,
      status: record.status,
      priority: record.priority,
      ownerId: record.assignedUserId,
    });
  }
}
