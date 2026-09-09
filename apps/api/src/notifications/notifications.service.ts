import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { NotificationType, Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { addUtcDays, utcToday } from '../common/date-range';
import { paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import type { NotificationListQueryDto } from './dto/notifications.dto';
import { AutomationsService } from '../automations/automations.service';

type NotificationInput = {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  dedupeKey: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AutomationsService) private readonly automations?: AutomationsService,
  ) {}

  async create(
    input: NotificationInput,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.notification.upsert({
      where: {
        organizationId_userId_dedupeKey: {
          organizationId: input.organizationId,
          userId: input.userId,
          dedupeKey: input.dedupeKey,
        },
      },
      create: input,
      update: {},
    });
  }

  async list(principal: AuthenticatedPrincipal, query: NotificationListQueryDto) {
    const page = Number(query.page ?? 1),
      limit = Number(query.limit ?? 25);
    const where = {
      organizationId: principal.organizationId,
      userId: principal.userId,
      ...(query.unread ? { readAt: null } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, meta: paginationMeta(page, limit, total) };
  }
  unreadCount(principal: AuthenticatedPrincipal) {
    return this.prisma.notification.count({
      where: { organizationId: principal.organizationId, userId: principal.userId, readAt: null },
    });
  }
  async markRead(principal: AuthenticatedPrincipal, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId: principal.organizationId, userId: principal.userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }
  async markAllRead(principal: AuthenticatedPrincipal) {
    const result = await this.prisma.notification.updateMany({
      where: { organizationId: principal.organizationId, userId: principal.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async generateScheduled(now = new Date()) {
    const today = utcToday(now),
      tomorrow = addUtcDays(today, 1),
      dayAfter = addUtcDays(today, 2);
    const [overdueTasks, dueSoonTasks, followUps, projects] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          archivedAt: null,
          assigneeId: { not: null },
          status: { not: 'COMPLETED' },
          dueDate: { lt: today },
        },
        select: { id: true, organizationId: true, assigneeId: true, title: true, dueDate: true },
      }),
      this.prisma.task.findMany({
        where: {
          archivedAt: null,
          assigneeId: { not: null },
          status: { not: 'COMPLETED' },
          dueDate: { gte: tomorrow, lt: dayAfter },
        },
        select: { id: true, organizationId: true, assigneeId: true, title: true, dueDate: true },
      }),
      this.prisma.followUp.findMany({
        where: {
          status: 'PENDING',
          assignedToId: { not: null },
          dueAt: { lte: addUtcDays(today, 1) },
        },
        select: {
          id: true,
          organizationId: true,
          assignedToId: true,
          lead: { select: { id: true, title: true } },
        },
      }),
      this.prisma.project.findMany({
        where: {
          archivedAt: null,
          projectManagerId: { not: null },
          status: { in: ['PLANNED', 'IN_PROGRESS', 'IN_REVIEW'] },
          deadline: { gte: today, lt: dayAfter },
        },
        select: {
          id: true,
          organizationId: true,
          projectManagerId: true,
          name: true,
          deadline: true,
        },
      }),
    ]);
    const work: Promise<unknown>[] = [];
    for (const task of overdueTasks) {
      work.push(
        this.create({
          organizationId: task.organizationId,
          userId: task.assigneeId!,
          type: 'TASK_OVERDUE',
          title: 'Task overdue',
          message: task.title,
          entityType: 'TASK',
          entityId: task.id,
          dedupeKey: `task:${task.id}:overdue`,
        }),
      );
      if (this.automations)
        work.push(
          this.automations.publishBusinessEvent(
            task.organizationId,
            'task.overdue',
            task.id,
            { title: task.title, dueDate: task.dueDate?.toISOString() },
            { triggerEventId: `task-overdue:${task.id}:${task.dueDate?.toISOString() ?? 'none'}` },
          ),
        );
    }
    for (const task of dueSoonTasks)
      work.push(
        this.create({
          organizationId: task.organizationId,
          userId: task.assigneeId!,
          type: 'TASK_DUE_SOON',
          title: 'Task due soon',
          message: task.title,
          entityType: 'TASK',
          entityId: task.id,
          dedupeKey: `task:${task.id}:due:${task.dueDate!.toISOString().slice(0, 10)}`,
        }),
      );
    for (const followUp of followUps)
      work.push(
        this.create({
          organizationId: followUp.organizationId,
          userId: followUp.assignedToId!,
          type: 'FOLLOW_UP_DUE',
          title: 'Follow-up due',
          message: followUp.lead.title,
          entityType: 'LEAD',
          entityId: followUp.lead.id,
          dedupeKey: `follow-up:${followUp.id}:due`,
        }),
      );
    for (const project of projects)
      work.push(
        this.create({
          organizationId: project.organizationId,
          userId: project.projectManagerId!,
          type: 'PROJECT_DEADLINE_SOON',
          title: 'Project deadline approaching',
          message: project.name,
          entityType: 'PROJECT',
          entityId: project.id,
          dedupeKey: `project:${project.id}:deadline:${project.deadline!.toISOString().slice(0, 10)}`,
        }),
      );
    await Promise.all(work);
    return work.length;
  }
}
