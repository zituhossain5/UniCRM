import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ScheduledActivityStatus } from '../generated/prisma/client';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import type {
  ActivityListQueryDto,
  CreateScheduledActivityDto,
  UpdateScheduledActivityDto,
} from './dto/activities.dto';

const userSelect = { id: true, firstName: true, lastName: true, status: true } as const;
const include = {
  owner: { select: userSelect },
  createdBy: { select: userSelect },
} satisfies Prisma.ScheduledActivityInclude;

type UnifiedActivity = {
  id: string;
  source: 'SCHEDULED_ACTIVITY' | 'TASK' | 'FOLLOW_UP' | 'PROJECT_DEADLINE';
  type: string;
  subject: string;
  description: string | null;
  owner: { id: string; firstName: string; lastName: string; status: string } | null;
  ownerId: string | null;
  startAt: Date;
  endAt: Date | null;
  status: string;
  priority: string;
  reminderAt: Date | null;
  completedAt: Date | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedRecord: { id: string; name: string } | null;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]),
  ) as ZonedParts;
}

function zonedDateToUtc(year: number, month: number, day: number, timeZone: string) {
  let guess = Date.UTC(year, month - 1, day);
  for (let index = 0; index < 3; index += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    guess += Date.UTC(year, month - 1, day) - represented;
  }
  return new Date(guess);
}

export function dayBounds(now: Date, timeZone: string) {
  const parts = zonedParts(now, timeZone);
  const start = zonedDateToUtc(parts.year, parts.month, parts.day, timeZone);
  const nextLocal = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const end = zonedDateToUtc(
    nextLocal.getUTCFullYear(),
    nextLocal.getUTCMonth() + 1,
    nextLocal.getUTCDate(),
    timeZone,
  );
  return { start, end };
}

@Injectable()
export class ActivitiesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(principal: AuthenticatedPrincipal, query: ActivityListQueryDto) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: principal.organizationId },
      select: { timezone: true },
    });
    const now = new Date();
    const today = dayBounds(now, organization.timezone);
    const range = this.range(query, now, today);
    const search = query.search?.trim().toLowerCase();
    const includeScheduled =
      !query.type || (query.type !== 'TASK' && query.type !== 'PROJECT_DEADLINE');
    const includeTasks = !query.type || query.type === 'TASK';
    const includeLegacyFollowUps = !query.type || query.type === 'FOLLOW_UP';
    const includeProjectDeadlines = !query.type || query.type === 'PROJECT_DEADLINE';
    const scheduledType =
      query.type && query.type !== 'TASK' && query.type !== 'PROJECT_DEADLINE'
        ? query.type
        : undefined;
    const ownerId = query.owner ?? (query.view === 'mine' ? principal.userId : undefined);

    const [scheduled, tasks, followUps, projects] = await Promise.all([
      includeScheduled
        ? this.prisma.scheduledActivity.findMany({
            where: {
              organizationId: principal.organizationId,
              ...(scheduledType ? { type: scheduledType } : {}),
              ...(ownerId ? { ownerId } : {}),
              ...(() => {
                const status = query.status ?? this.statusForView(query.view);
                return status ? { status } : {};
              })(),
              ...(query.relatedEntityType ? { relatedEntityType: query.relatedEntityType } : {}),
              ...(query.relatedEntityId ? { relatedEntityId: query.relatedEntityId } : {}),
              ...(range ? { startAt: range } : {}),
              ...(search
                ? {
                    OR: [
                      { subject: { contains: search, mode: 'insensitive' } },
                      { description: { contains: search, mode: 'insensitive' } },
                    ],
                  }
                : {}),
            },
            include,
          })
        : Promise.resolve([]),
      includeTasks &&
      (!query.status || query.status === 'PLANNED' || query.status === 'COMPLETED') &&
      !query.relatedEntityType
        ? this.prisma.task.findMany({
            where: {
              organizationId: principal.organizationId,
              archivedAt: null,
              dueDate: { not: null, ...(range ?? {}) },
              ...(ownerId ? { assigneeId: ownerId } : {}),
              ...(query.status === 'COMPLETED' || query.view === 'completed'
                ? { status: 'COMPLETED' }
                : { status: { not: 'COMPLETED' } }),
              ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
            },
            include: {
              assignee: { select: userSelect },
              project: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      includeLegacyFollowUps &&
      (!query.status ||
        query.status === 'PLANNED' ||
        query.status === 'COMPLETED' ||
        query.status === 'CANCELLED') &&
      (!query.relatedEntityType || query.relatedEntityType === 'LEAD')
        ? this.prisma.followUp.findMany({
            where: {
              organizationId: principal.organizationId,
              dueAt: range,
              ...(ownerId ? { assignedToId: ownerId } : {}),
              ...(query.relatedEntityId ? { leadId: query.relatedEntityId } : {}),
              status: this.followUpStatus(query),
              ...(search
                ? {
                    OR: [
                      { notes: { contains: search, mode: 'insensitive' } },
                      { lead: { title: { contains: search, mode: 'insensitive' } } },
                    ],
                  }
                : {}),
            },
            include: {
              assignedTo: { select: userSelect },
              lead: { select: { id: true, title: true } },
            },
          })
        : Promise.resolve([]),
      includeProjectDeadlines &&
      query.view !== 'completed' &&
      (!query.status || query.status === 'PLANNED') &&
      !query.relatedEntityType
        ? this.prisma.project.findMany({
            where: {
              organizationId: principal.organizationId,
              archivedAt: null,
              deadline: { not: null, ...(range ?? {}) },
              status: { notIn: ['COMPLETED', 'CANCELLED'] },
              ...(ownerId ? { projectManagerId: ownerId } : {}),
              ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
            },
            include: {
              projectManager: { select: userSelect },
              company: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
    ]);
    const relatedLabels = await this.relatedLabels(principal.organizationId, scheduled);

    const data: UnifiedActivity[] = [
      ...scheduled.map((item) => ({
        id: item.id,
        source: 'SCHEDULED_ACTIVITY' as const,
        type: item.type,
        subject: item.subject,
        description: item.description,
        owner: item.owner,
        ownerId: item.ownerId,
        startAt: item.startAt,
        endAt: item.endAt,
        status: item.status,
        priority: item.priority,
        reminderAt: item.reminderAt,
        completedAt: item.completedAt,
        relatedEntityType: item.relatedEntityType,
        relatedEntityId: item.relatedEntityId,
        relatedRecord:
          relatedLabels.get(`${item.relatedEntityType}:${item.relatedEntityId}`) ?? null,
      })),
      ...tasks.map((item) => ({
        id: item.id,
        source: 'TASK' as const,
        type: 'TASK',
        subject: item.title,
        description: item.description,
        owner: item.assignee,
        ownerId: item.assigneeId,
        startAt: item.dueDate!,
        endAt: null,
        status: item.status === 'COMPLETED' ? 'COMPLETED' : 'PLANNED',
        priority: item.priority,
        reminderAt: null,
        completedAt: item.completedAt,
        relatedEntityType: item.projectId ? 'PROJECT' : null,
        relatedEntityId: item.projectId,
        relatedRecord: item.project ? { id: item.project.id, name: item.project.name } : null,
      })),
      ...followUps.map((item) => ({
        id: item.id,
        source: 'FOLLOW_UP' as const,
        type: 'FOLLOW_UP',
        subject: item.lead.title,
        description: item.notes,
        owner: item.assignedTo,
        ownerId: item.assignedToId,
        startAt: item.dueAt,
        endAt: null,
        status: item.status === 'PENDING' ? 'PLANNED' : item.status,
        priority: 'MEDIUM',
        reminderAt: null,
        completedAt: item.completedAt,
        relatedEntityType: 'LEAD',
        relatedEntityId: item.leadId,
        relatedRecord: { id: item.lead.id, name: item.lead.title },
      })),
      ...projects.map((item) => ({
        id: item.id,
        source: 'PROJECT_DEADLINE' as const,
        type: 'PROJECT_DEADLINE',
        subject: item.name,
        description: item.description,
        owner: item.projectManager,
        ownerId: item.projectManagerId,
        startAt: item.deadline!,
        endAt: null,
        status: 'PLANNED',
        priority: item.priority,
        reminderAt: null,
        completedAt: null,
        relatedEntityType: 'PROJECT',
        relatedEntityId: item.id,
        relatedRecord: { id: item.id, name: item.name },
      })),
    ];
    const direction = query.order === 'desc' ? -1 : 1;
    data.sort((left, right) => {
      const a = query.sort === 'startAt' ? left.startAt.getTime() : String(left[query.sort]);
      const b = query.sort === 'startAt' ? right.startAt.getTime() : String(right[query.sort]);
      return (a < b ? -1 : a > b ? 1 : 0) * direction;
    });
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 25);
    return {
      data: data.slice((page - 1) * limit, page * limit),
      meta: { ...paginationMeta(page, limit, data.length), timezone: organization.timezone },
    };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const activity = await this.prisma.scheduledActivity.findFirst({
      where: { id, organizationId: principal.organizationId },
      include,
    });
    if (!activity) throw new NotFoundException('Scheduled activity not found');
    return activity;
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateScheduledActivityDto) {
    const ownerId = dto.ownerId ?? principal.userId;
    await this.validateOwner(principal, ownerId);
    await this.validateRelated(
      principal.organizationId,
      dto.relatedEntityType,
      dto.relatedEntityId,
    );
    const dates = this.validateDates(dto.startAt, dto.endAt, dto.reminderAt);
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.scheduledActivity.create({
        data: {
          organizationId: principal.organizationId,
          createdById: principal.userId,
          ownerId,
          type: dto.type,
          subject: dto.subject,
          description: dto.description,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
          priority: dto.priority,
          ...dates,
        },
        include,
      });
      await this.writeHistory(
        tx,
        principal,
        activity.id,
        dto.relatedEntityType,
        dto.relatedEntityId,
        'ACTIVITY_SCHEDULED',
        { subject: activity.subject, type: activity.type, startAt: activity.startAt.toISOString() },
      );
      return activity;
    });
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateScheduledActivityDto) {
    const existing = await this.requireEditable(principal, id);
    if (dto.ownerId && dto.ownerId !== existing.ownerId)
      await this.validateOwner(principal, dto.ownerId);
    const dates = this.validateDates(
      dto.startAt ?? existing.startAt.toISOString(),
      dto.endAt === undefined ? existing.endAt?.toISOString() : dto.endAt,
      dto.reminderAt === undefined ? existing.reminderAt?.toISOString() : dto.reminderAt,
    );
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.scheduledActivity.update({
        where: { id },
        data: { ...dto, ...dates },
        include,
      });
      await this.writeHistory(
        tx,
        principal,
        id,
        existing.relatedEntityType,
        existing.relatedEntityId,
        'ACTIVITY_RESCHEDULED',
        { subject: activity.subject, startAt: activity.startAt.toISOString() },
      );
      return activity;
    });
  }

  async changeStatus(
    principal: AuthenticatedPrincipal,
    id: string,
    status: ScheduledActivityStatus,
  ) {
    const existing = await this.requireEditable(principal, id);
    if (existing.status !== 'PLANNED')
      throw new BadRequestException('Only planned activities can be completed or cancelled');
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.scheduledActivity.update({
        where: { id },
        data: { status, completedAt: status === 'COMPLETED' ? new Date() : null },
        include,
      });
      await this.writeHistory(
        tx,
        principal,
        id,
        existing.relatedEntityType,
        existing.relatedEntityId,
        status === 'COMPLETED' ? 'ACTIVITY_COMPLETED' : 'ACTIVITY_CANCELLED',
        { subject: activity.subject, type: activity.type },
      );
      return activity;
    });
  }

  async remove(principal: AuthenticatedPrincipal, id: string) {
    await this.get(principal, id);
    return this.prisma.scheduledActivity.delete({ where: { id } });
  }

  private range(
    query: ActivityListQueryDto,
    now: Date,
    today: { start: Date; end: Date },
  ): Prisma.DateTimeFilter | undefined {
    const explicit =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          }
        : undefined;
    if (explicit) return explicit;
    if (query.view === 'today') return { gte: today.start, lt: today.end };
    if (query.view === 'upcoming') return { gte: today.end };
    if (query.view === 'overdue') return { lt: now };
    return undefined;
  }

  private statusForView(view: ActivityListQueryDto['view']): ScheduledActivityStatus | undefined {
    if (view === 'completed') return 'COMPLETED';
    if (view === 'today' || view === 'upcoming' || view === 'overdue') return 'PLANNED';
    return undefined;
  }

  private followUpStatus(query: ActivityListQueryDto) {
    if (query.status === 'COMPLETED' || query.view === 'completed') return 'COMPLETED' as const;
    if (query.status === 'CANCELLED') return 'CANCELLED' as const;
    return 'PENDING' as const;
  }

  private validateDates(
    startValue: string,
    endValue?: string | null,
    reminderValue?: string | null,
  ) {
    const startAt = new Date(startValue);
    const endAt = endValue ? new Date(endValue) : null;
    const reminderAt = reminderValue ? new Date(reminderValue) : null;
    if (endAt && endAt < startAt) throw new BadRequestException('endAt must not be before startAt');
    if (reminderAt && reminderAt > startAt)
      throw new BadRequestException('reminderAt must not be after startAt');
    return { startAt, endAt, reminderAt };
  }

  private async validateOwner(principal: AuthenticatedPrincipal, ownerId: string) {
    if (ownerId !== principal.userId && !principal.permissions.includes(PERMISSIONS.activityAssign))
      throw new ForbiddenException('Missing permission: activity.assign');
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, organizationId: principal.organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!owner) throw new BadRequestException('Activity owner is invalid');
  }

  private async validateRelated(organizationId: string, type: string, id: string) {
    const exists =
      type === 'LEAD'
        ? await this.prisma.lead.findFirst({
            where: { id, organizationId, archivedAt: null },
            select: { id: true },
          })
        : type === 'DEAL'
          ? await this.prisma.deal.findFirst({
              where: { id, organizationId, archivedAt: null },
              select: { id: true },
            })
          : type === 'CONTACT'
            ? await this.prisma.contact.findFirst({
                where: { id, organizationId, archivedAt: null },
                select: { id: true },
              })
            : await this.prisma.company.findFirst({
                where: { id, organizationId, archivedAt: null },
                select: { id: true },
              });
    if (!exists) throw new BadRequestException('Related CRM record is invalid');
  }

  private async relatedLabels(
    organizationId: string,
    activities: Array<{ relatedEntityType: string; relatedEntityId: string }>,
  ) {
    const ids = (type: string) =>
      activities
        .filter((item) => item.relatedEntityType === type)
        .map((item) => item.relatedEntityId);
    const [leads, deals, contacts, companies] = await Promise.all([
      this.prisma.lead.findMany({
        where: { organizationId, id: { in: ids('LEAD') } },
        select: { id: true, title: true },
      }),
      this.prisma.deal.findMany({
        where: { organizationId, id: { in: ids('DEAL') } },
        select: { id: true, name: true },
      }),
      this.prisma.contact.findMany({
        where: { organizationId, id: { in: ids('CONTACT') } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.company.findMany({
        where: { organizationId, id: { in: ids('COMPANY') } },
        select: { id: true, name: true },
      }),
    ]);
    return new Map<string, { id: string; name: string }>([
      ...leads.map((item) => [`LEAD:${item.id}`, { id: item.id, name: item.title }] as const),
      ...deals.map((item) => [`DEAL:${item.id}`, { id: item.id, name: item.name }] as const),
      ...contacts.map(
        (item) =>
          [
            `CONTACT:${item.id}`,
            { id: item.id, name: `${item.firstName} ${item.lastName}`.trim() },
          ] as const,
      ),
      ...companies.map((item) => [`COMPANY:${item.id}`, { id: item.id, name: item.name }] as const),
    ]);
  }

  private async requireEditable(principal: AuthenticatedPrincipal, id: string) {
    const activity = await this.get(principal, id);
    if (
      activity.ownerId !== principal.userId &&
      !principal.permissions.includes(PERMISSIONS.activityAssign)
    )
      throw new ForbiddenException('You can only update your own activities');
    return activity;
  }

  private async writeHistory(
    tx: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
    activityId: string,
    relatedEntityType: string,
    relatedEntityId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.activityLog.createMany({
      data: [
        {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: 'SCHEDULED_ACTIVITY',
          entityId: activityId,
          action,
          metadata: metadata as Prisma.InputJsonValue,
        },
        {
          organizationId: principal.organizationId,
          actorId: principal.userId,
          entityType: relatedEntityType,
          entityId: relatedEntityId,
          action,
          metadata: { ...metadata, activityId },
        },
      ],
    });
  }
}
