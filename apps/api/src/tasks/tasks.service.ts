import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CreateTaskDto,
  TaskListQueryDto,
  UpdateTaskDto,
  CreateTaskCommentDto,
} from './dto/tasks.dto';

const userSelect = { id: true, firstName: true, lastName: true, status: true } as const;
const taskInclude = {
  project: { select: { id: true, name: true, status: true } },
  assignee: { select: userSelect },
  reporter: { select: userSelect },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

function dateOnly(value: string | null | undefined) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : undefined;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: TaskListQueryDto) {
    const listQuery = normalizeListQuery(query, 'createdAt', [
      'title',
      'createdAt',
      'updatedAt',
      'dueDate',
      'status',
      'priority',
    ]);
    const today = todayUtc();
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const where: Prisma.TaskWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      project: { archivedAt: null },
      ...(query.project ? { projectId: query.project } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assignee ? { assigneeId: query.assignee } : {}),
      ...(query.dueDate ? { dueDate: dateOnly(query.dueDate) } : {}),
      ...(query.view === 'mine' ? { assigneeId: principal.userId } : {}),
      ...(query.view === 'dueToday' ? { dueDate: { gte: today, lt: tomorrow } } : {}),
      ...(query.view === 'overdue' ? { dueDate: { lt: today }, status: { not: 'COMPLETED' } } : {}),
      ...(listQuery.search
        ? {
            OR: [
              { title: { contains: listQuery.search, mode: 'insensitive' } },
              { project: { name: { contains: listQuery.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy = { [listQuery.sort]: listQuery.order } as Prisma.TaskOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy,
        skip: (listQuery.page - 1) * listQuery.limit,
        take: listQuery.limit,
      }),
      this.prisma.task.count({ where }),
    ]);
    return { data, meta: paginationMeta(listQuery.page, listQuery.limit, total) };
  }

  async get(principal: AuthenticatedPrincipal, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: { ...taskInclude, createdBy: { select: userSelect } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(principal: AuthenticatedPrincipal, dto: CreateTaskDto) {
    const project = await this.validateProject(principal.organizationId, dto.projectId);
    await this.validateAssignee(principal, dto.assigneeId);
    this.validateDates(dto.startDate, dto.dueDate);
    const { startDate, dueDate, ...input } = dto;
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          ...input,
          startDate: dateOnly(startDate),
          dueDate: dateOnly(dueDate),
          organizationId: principal.organizationId,
          reporterId: principal.userId,
          createdById: principal.userId,
          completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
        },
        include: taskInclude,
      });
      await this.audit.create(
        {
          action: 'TASK_CREATED',
          actorId: principal.userId,
          entityId: task.id,
          entityType: 'TASK',
          organizationId: principal.organizationId,
          metadata: { projectId: project.id },
        },
        tx,
      );
      await this.audit.create(
        {
          action: 'PROJECT_TASK_CREATED',
          actorId: principal.userId,
          entityId: project.id,
          entityType: 'PROJECT',
          organizationId: principal.organizationId,
          metadata: { taskId: task.id, title: task.title },
        },
        tx,
      );
      if (task.assigneeId && task.assigneeId !== principal.userId) {
        await this.notifications.create(
          {
            organizationId: principal.organizationId,
            userId: task.assigneeId,
            type: 'TASK_ASSIGNED',
            title: 'Task assigned',
            message: task.title,
            entityType: 'TASK',
            entityId: task.id,
            dedupeKey: `task:${task.id}:assigned:${task.assigneeId}`,
          },
          tx,
        );
      }
      return task;
    });
  }

  async update(principal: AuthenticatedPrincipal, id: string, dto: UpdateTaskDto) {
    const existing = await this.requireActive(principal.organizationId, id);
    if (dto.projectId && dto.projectId !== existing.projectId)
      await this.validateProject(principal.organizationId, dto.projectId);
    if (dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId)
      await this.validateAssignee(principal, dto.assigneeId);
    const existingStartDate: Date | null = existing.startDate;
    const existingDueDate: Date | null = existing.dueDate;
    const finalStartDate =
      dto.startDate === undefined ? existingStartDate : dateOnly(dto.startDate);
    const finalDueDate = dto.dueDate === undefined ? existingDueDate : dateOnly(dto.dueDate);
    if (finalStartDate && finalDueDate && finalStartDate > finalDueDate)
      throw new BadRequestException('startDate must not be after dueDate');
    const { startDate, dueDate, ...input } = dto;
    const completed = dto.status === 'COMPLETED' && existing.status !== 'COMPLETED';
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id },
        data: {
          ...input,
          ...(startDate !== undefined
            ? { startDate: startDate === null ? null : dateOnly(startDate) }
            : {}),
          ...(dueDate !== undefined
            ? { dueDate: dueDate === null ? null : dateOnly(dueDate) }
            : {}),
          ...(dto.status !== undefined
            ? {
                completedAt:
                  dto.status === 'COMPLETED' ? (existing.completedAt ?? new Date()) : null,
              }
            : {}),
        },
        include: taskInclude,
      });
      await this.audit.create(
        {
          action: completed ? 'TASK_COMPLETED' : 'TASK_UPDATED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'TASK',
          organizationId: principal.organizationId,
          metadata: {
            projectId: task.projectId,
            ...(dto.status && dto.status !== existing.status
              ? { status: { from: existing.status, to: dto.status } }
              : {}),
            ...(dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId
              ? { assigneeId: { from: existing.assigneeId, to: dto.assigneeId } }
              : {}),
          },
        },
        tx,
      );
      if (completed) {
        await this.audit.create(
          {
            action: 'PROJECT_TASK_COMPLETED',
            actorId: principal.userId,
            entityId: task.projectId,
            entityType: 'PROJECT',
            organizationId: principal.organizationId,
            metadata: { taskId: task.id, title: task.title },
          },
          tx,
        );
      }
      if (
        dto.assigneeId &&
        dto.assigneeId !== existing.assigneeId &&
        dto.assigneeId !== principal.userId
      ) {
        await this.notifications.create(
          {
            organizationId: principal.organizationId,
            userId: dto.assigneeId,
            type: 'TASK_ASSIGNED',
            title: 'Task assigned',
            message: task.title,
            entityType: 'TASK',
            entityId: task.id,
            dedupeKey: `task:${task.id}:assigned:${dto.assigneeId}`,
          },
          tx,
        );
      }
      return task;
    });
  }

  async archive(principal: AuthenticatedPrincipal, id: string) {
    await this.requireActive(principal.organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id },
        data: { archivedAt: new Date() },
        include: taskInclude,
      });
      await this.audit.create(
        {
          action: 'TASK_ARCHIVED',
          actorId: principal.userId,
          entityId: id,
          entityType: 'TASK',
          organizationId: principal.organizationId,
          metadata: { projectId: task.projectId },
        },
        tx,
      );
      return task;
    });
  }

  async listComments(principal: AuthenticatedPrincipal, taskId: string) {
    await this.requireTask(principal.organizationId, taskId);
    return this.prisma.taskComment.findMany({
      where: { organizationId: principal.organizationId, taskId },
      include: { user: { select: userSelect } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createComment(
    principal: AuthenticatedPrincipal,
    taskId: string,
    dto: CreateTaskCommentDto,
  ) {
    await this.requireActive(principal.organizationId, taskId);
    return this.prisma.taskComment.create({
      data: {
        content: dto.content,
        organizationId: principal.organizationId,
        taskId,
        userId: principal.userId,
      },
      include: { user: { select: userSelect } },
    });
  }

  async updateComment(
    principal: AuthenticatedPrincipal,
    taskId: string,
    commentId: string,
    dto: CreateTaskCommentDto,
  ) {
    await this.requireTask(principal.organizationId, taskId);
    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId, organizationId: principal.organizationId },
    });
    if (!comment) throw new NotFoundException('Task comment not found');
    if (comment.userId !== principal.userId)
      throw new ForbiddenException('You can only edit your own comments');
    return this.prisma.taskComment.update({
      where: { id: commentId },
      data: { content: dto.content },
      include: { user: { select: userSelect } },
    });
  }

  async deleteComment(principal: AuthenticatedPrincipal, taskId: string, commentId: string) {
    await this.requireTask(principal.organizationId, taskId);
    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId, organizationId: principal.organizationId },
    });
    if (!comment) throw new NotFoundException('Task comment not found');
    if (
      comment.userId !== principal.userId &&
      !principal.permissions.includes(PERMISSIONS.taskDelete)
    )
      throw new ForbiddenException('You cannot delete this comment');
    await this.prisma.taskComment.delete({ where: { id: commentId } });
  }

  private validateDates(startDate?: string | null, dueDate?: string | null) {
    if (startDate && dueDate && dateOnly(startDate)! > dateOnly(dueDate)!)
      throw new BadRequestException('startDate must not be after dueDate');
  }

  private async validateProject(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async validateAssignee(
    principal: AuthenticatedPrincipal,
    assigneeId: string | null | undefined,
  ) {
    if (!assigneeId) return;
    if (!principal.permissions.includes(PERMISSIONS.taskAssign))
      throw new ForbiddenException('Insufficient permission to assign tasks');
    const user = await this.prisma.user.findFirst({
      where: { id: assigneeId, organizationId: principal.organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Active organization user not found');
  }

  private async requireTask(organizationId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId },
      select: { id: true, archivedAt: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async requireActive(organizationId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        projectId: true,
        assigneeId: true,
        status: true,
        completedAt: true,
        startDate: true,
        dueDate: true,
        archivedAt: true,
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.archivedAt) throw new ConflictException('Archived tasks cannot be modified');
    return task;
  }
}
