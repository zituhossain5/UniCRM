import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { normalizeListQuery, paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import {
  ConversationEventType,
  InboxPriority,
  InboxThreadStatus,
  UserStatus,
} from '../generated/prisma/enums';
import { LeadsService } from '../leads/leads.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';
import type {
  AddConversationNoteDto,
  AssignConversationDto,
  CreateLeadFromThreadDto,
  CreateTaskFromThreadDto,
  SetConversationReadDto,
  SharedInboxQueryDto,
  UpdateConversationPriorityDto,
  UpdateConversationStatusDto,
} from './dto/mailboxes.dto';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
} as const;

@Injectable()
export class SharedInboxService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(LeadsService) private readonly leads: LeadsService,
    @Inject(TasksService) private readonly tasks: TasksService,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: SharedInboxQueryDto) {
    const listQuery = normalizeListQuery(query, 'lastMessageAt', ['lastMessageAt', 'createdAt']);
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const viewWhere: Prisma.EmailThreadWhereInput =
      query.view === 'UNASSIGNED'
        ? { assignedUserId: null, inboxStatus: InboxThreadStatus.UNASSIGNED }
        : query.view === 'MINE'
          ? {
              assignedUserId: principal.userId,
              inboxStatus: { notIn: [InboxThreadStatus.RESOLVED, InboxThreadStatus.CLOSED] },
            }
          : query.view === 'OPEN'
            ? { inboxStatus: InboxThreadStatus.OPEN }
            : query.view === 'WAITING'
              ? { inboxStatus: InboxThreadStatus.WAITING }
              : query.view === 'RESOLVED'
                ? { inboxStatus: InboxThreadStatus.RESOLVED }
                : query.view === 'UNMATCHED'
                  ? { relatedEntityId: null }
                  : query.view === 'SENT'
                    ? { messages: { some: { direction: 'OUTBOUND' } } }
                    : {
                        inboxStatus: {
                          in: [
                            InboxThreadStatus.UNASSIGNED,
                            InboxThreadStatus.OPEN,
                            InboxThreadStatus.WAITING,
                          ],
                        },
                      };
    const where: Prisma.EmailThreadWhereInput = {
      organizationId: principal.organizationId,
      ...viewWhere,
      ...(query.mailboxId ? { mailboxConnectionId: query.mailboxId } : {}),
      ...(query.assigneeId ? { assignedUserId: query.assigneeId } : {}),
      ...(query.status ? { inboxStatus: query.status } : {}),
      ...(query.priority ? { inboxPriority: query.priority } : {}),
      ...(query.unread ? { isUnread: query.unread === 'true' } : {}),
      ...(query.due === 'overdue'
        ? { dueAt: { lt: now }, inboxStatus: { notIn: ['RESOLVED', 'CLOSED'] } }
        : query.due === 'soon'
          ? { dueAt: { gte: now, lte: dueSoon }, inboxStatus: { notIn: ['RESOLVED', 'CLOSED'] } }
          : {}),
      ...(listQuery.search
        ? {
            OR: [
              { subject: { contains: listQuery.search, mode: 'insensitive' } },
              {
                messages: {
                  some: {
                    OR: [
                      { fromName: { contains: listQuery.search, mode: 'insensitive' } },
                      { fromAddress: { contains: listQuery.search, mode: 'insensitive' } },
                      { body: { contains: listQuery.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [threads, total] = await this.prisma.$transaction([
      this.prisma.emailThread.findMany({
        where,
        include: {
          assignedUser: { select: userSelect },
          mailboxConnection: { select: { id: true, name: true, emailAddress: true } },
          messages: {
            orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: {
              id: true,
              direction: true,
              fromName: true,
              fromAddress: true,
              toAddresses: true,
              body: true,
              status: true,
              receivedAt: true,
              sentAt: true,
              createdAt: true,
            },
          },
          _count: { select: { notes: true } },
        },
        orderBy: { lastMessageAt: listQuery.order },
        skip: (listQuery.page - 1) * listQuery.limit,
        take: listQuery.limit,
      }),
      this.prisma.emailThread.count({ where }),
    ]);
    return { data: threads, meta: paginationMeta(listQuery.page, listQuery.limit, total) };
  }

  collaborators(principal: AuthenticatedPrincipal) {
    return this.prisma.user.findMany({
      where: { organizationId: principal.organizationId, status: UserStatus.ACTIVE },
      select: userSelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async assign(principal: AuthenticatedPrincipal, id: string, dto: AssignConversationDto) {
    const thread = await this.requireThread(principal.organizationId, id);
    const assignee = dto.assignedUserId
      ? await this.prisma.user.findFirst({
          where: {
            id: dto.assignedUserId,
            organizationId: principal.organizationId,
            status: UserStatus.ACTIVE,
          },
          select: userSelect,
        })
      : null;
    if (dto.assignedUserId && !assignee)
      throw new BadRequestException('Assignee must be an active organization user');
    if (thread.assignedUserId === dto.assignedUserId) return this.get(principal, id);
    const type = !dto.assignedUserId
      ? ConversationEventType.UNASSIGNED
      : thread.assignedUserId
        ? ConversationEventType.REASSIGNED
        : ConversationEventType.ASSIGNED;
    await this.prisma.$transaction(async (tx) => {
      await tx.emailThread.update({
        where: { id },
        data: {
          assignedUserId: dto.assignedUserId,
          inboxStatus: dto.assignedUserId ? InboxThreadStatus.OPEN : InboxThreadStatus.UNASSIGNED,
          resolvedAt: null,
        },
      });
      await this.event(tx, thread, principal.userId, type, {
        fromUserId: thread.assignedUserId,
        toUserId: dto.assignedUserId,
      });
      if (assignee && assignee.id !== principal.userId)
        await this.notifications.create(
          {
            organizationId: principal.organizationId,
            userId: assignee.id,
            type: 'INBOX_ASSIGNED',
            title: `${thread.inboxPriority === InboxPriority.URGENT ? 'Urgent' : thread.inboxPriority === InboxPriority.HIGH ? 'High priority' : 'Inbox'} conversation assigned`,
            message: thread.subject,
            entityType: 'EMAIL_THREAD',
            entityId: thread.id,
            dedupeKey: `inbox:${thread.id}:assigned:${assignee.id}:${thread.updatedAt.toISOString()}`,
          },
          tx,
        );
    });
    return this.get(principal, id);
  }

  async updateStatus(
    principal: AuthenticatedPrincipal,
    id: string,
    dto: UpdateConversationStatusDto,
  ) {
    if (dto.status === undefined && dto.dueAt === undefined)
      throw new BadRequestException('Status or dueAt is required');
    const thread = await this.requireThread(principal.organizationId, id);
    const dueAt = dto.dueAt === undefined ? thread.dueAt : dto.dueAt ? new Date(dto.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new BadRequestException('dueAt is invalid');
    const nextStatus = dto.status ?? thread.inboxStatus;
    const resolved = isTerminalStatus(nextStatus);
    await this.prisma.$transaction(async (tx) => {
      await tx.emailThread.update({
        where: { id },
        data: {
          inboxStatus: nextStatus,
          ...(nextStatus === InboxThreadStatus.UNASSIGNED ? { assignedUserId: null } : {}),
          dueAt,
          resolvedAt: resolved ? (thread.resolvedAt ?? new Date()) : null,
        },
      });
      if (dto.status && dto.status !== thread.inboxStatus) {
        const wasResolved = isTerminalStatus(thread.inboxStatus);
        await this.event(
          tx,
          thread,
          principal.userId,
          resolved
            ? ConversationEventType.RESOLVED
            : wasResolved
              ? ConversationEventType.REOPENED
              : ConversationEventType.STATUS_CHANGED,
          { from: thread.inboxStatus, to: dto.status },
        );
      }
      if (dto.dueAt !== undefined && dueAt?.getTime() !== thread.dueAt?.getTime())
        await this.event(tx, thread, principal.userId, ConversationEventType.DUE_AT_CHANGED, {
          from: thread.dueAt?.toISOString() ?? null,
          to: dueAt?.toISOString() ?? null,
        });
    });
    return this.get(principal, id);
  }

  async updatePriority(
    principal: AuthenticatedPrincipal,
    id: string,
    dto: UpdateConversationPriorityDto,
  ) {
    const thread = await this.requireThread(principal.organizationId, id);
    if (thread.inboxPriority === dto.priority) return this.get(principal, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.emailThread.update({ where: { id }, data: { inboxPriority: dto.priority } });
      await this.event(tx, thread, principal.userId, ConversationEventType.PRIORITY_CHANGED, {
        from: thread.inboxPriority,
        to: dto.priority,
      });
      if (
        thread.assignedUserId &&
        thread.assignedUserId !== principal.userId &&
        isElevatedPriority(dto.priority)
      )
        await this.notifications.create(
          {
            organizationId: principal.organizationId,
            userId: thread.assignedUserId,
            type: 'INBOX_ASSIGNED',
            title: `${dto.priority === InboxPriority.URGENT ? 'Urgent' : 'High priority'} inbox conversation`,
            message: thread.subject,
            entityType: 'EMAIL_THREAD',
            entityId: thread.id,
            dedupeKey: `inbox:${thread.id}:priority:${dto.priority}:${thread.updatedAt.toISOString()}`,
          },
          tx,
        );
    });
    return this.get(principal, id);
  }

  async setRead(principal: AuthenticatedPrincipal, id: string, dto: SetConversationReadDto) {
    await this.requireThread(principal.organizationId, id);
    await this.prisma.emailThread.update({ where: { id }, data: { isUnread: dto.unread } });
    return { unread: dto.unread };
  }

  async addNote(principal: AuthenticatedPrincipal, id: string, dto: AddConversationNoteDto) {
    const thread = await this.requireThread(principal.organizationId, id);
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Internal note cannot be empty');
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.conversationNote.create({
        data: {
          organizationId: principal.organizationId,
          threadId: id,
          authorUserId: principal.userId,
          content,
        },
        include: { author: { select: userSelect } },
      });
      await this.event(tx, thread, principal.userId, ConversationEventType.NOTE_ADDED, {
        noteId: note.id,
      });
      return note;
    });
  }

  async createLead(principal: AuthenticatedPrincipal, id: string, dto: CreateLeadFromThreadDto) {
    const thread = await this.requireThread(principal.organizationId, id);
    const latestInbound = await this.latestInbound(principal.organizationId, id);
    const lead = await this.leads.create(principal, {
      ...dto,
      source: 'EMAIL',
      email: dto.email ?? latestInbound.fromAddress,
      description: dto.description ?? `Created from shared inbox: ${thread.subject}`,
    });
    if (!lead) throw new ConflictException('Lead could not be created');
    await this.prisma.$transaction(async (tx) => {
      await tx.emailThread.update({
        where: { id },
        data: { relatedEntityType: 'LEAD', relatedEntityId: lead.id },
      });
      await tx.emailMessage.updateMany({
        where: { organizationId: principal.organizationId, threadId: id },
        data: { relatedEntityType: 'LEAD', relatedEntityId: lead.id },
      });
      await this.event(tx, thread, principal.userId, ConversationEventType.CRM_LINKED, {
        relatedEntityType: 'LEAD',
        relatedEntityId: lead.id,
        created: true,
      });
    });
    return lead;
  }

  async createTask(principal: AuthenticatedPrincipal, id: string, dto: CreateTaskFromThreadDto) {
    const thread = await this.requireThread(principal.organizationId, id);
    const latestInbound = await this.latestInbound(principal.organizationId, id);
    const task = await this.tasks.create(principal, {
      ...dto,
      description:
        dto.description ??
        `Created from shared inbox: ${thread.subject}\n\nFrom: ${latestInbound.fromAddress}`,
    });
    await this.event(this.prisma, thread, principal.userId, ConversationEventType.CRM_LINKED, {
      relatedEntityType: 'TASK',
      relatedEntityId: task.id,
      created: true,
    });
    return task;
  }

  get(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.emailThread.findFirstOrThrow({
      where: { id, organizationId: principal.organizationId },
    });
  }

  private async requireThread(organizationId: string, id: string) {
    const thread = await this.prisma.emailThread.findFirst({ where: { id, organizationId } });
    if (!thread) throw new NotFoundException('Email thread not found');
    return thread;
  }

  private async latestInbound(organizationId: string, threadId: string) {
    const message = await this.prisma.emailMessage.findFirst({
      where: { organizationId, threadId, direction: 'INBOUND' },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!message) throw new ConflictException('This thread has no inbound message');
    return message;
  }

  private event(
    tx: Prisma.TransactionClient,
    thread: { id: string; organizationId: string },
    actorUserId: string | null,
    type: ConversationEventType,
    metadata?: Prisma.InputJsonValue,
  ) {
    return tx.conversationEvent.create({
      data: {
        organizationId: thread.organizationId,
        threadId: thread.id,
        actorUserId,
        type,
        metadata,
      },
    });
  }
}

function isTerminalStatus(status: InboxThreadStatus) {
  return status === InboxThreadStatus.RESOLVED || status === InboxThreadStatus.CLOSED;
}

function isElevatedPriority(priority: InboxPriority) {
  return priority === InboxPriority.HIGH || priority === InboxPriority.URGENT;
}
