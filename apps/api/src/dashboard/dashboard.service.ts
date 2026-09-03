import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { addUtcDays, utcToday } from '../common/date-range';
import { PrismaService } from '../database/prisma.service';

const incomplete = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'] as const;

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(principal: AuthenticatedPrincipal) {
    const organizationId = principal.organizationId;
    const today = utcToday();
    const tomorrow = addUtcDays(today, 1);
    const inSevenDays = addUtcDays(today, 8);
    const can = (permission: string) => principal.permissions.includes(permission);
    const organizationWide =
      principal.permissions.includes(PERMISSIONS.leadAssign) ||
      principal.permissions.includes(PERMISSIONS.projectManageMembers);
    const leadScope = organizationWide ? {} : { ownerId: principal.userId };
    const taskScope = organizationWide ? {} : { assigneeId: principal.userId };
    const followUpScope = organizationWide ? {} : { assignedToId: principal.userId };

    const [openLeads, activeProjects, dueToday, overdue, followUps, balances] = await Promise.all([
      can(PERMISSIONS.leadRead)
        ? this.prisma.lead.count({
            where: {
              organizationId,
              archivedAt: null,
              stage: { isWon: false, isLost: false },
              ...leadScope,
            },
          })
        : Promise.resolve(null),
      can(PERMISSIONS.projectRead)
        ? this.prisma.project.count({
            where: {
              organizationId,
              archivedAt: null,
              status: { in: ['IN_PROGRESS', 'IN_REVIEW'] },
            },
          })
        : Promise.resolve(null),
      can(PERMISSIONS.taskRead)
        ? this.prisma.task.count({
            where: {
              organizationId,
              archivedAt: null,
              status: { in: [...incomplete] },
              dueDate: { gte: today, lt: tomorrow },
              ...taskScope,
            },
          })
        : Promise.resolve(null),
      can(PERMISSIONS.taskRead)
        ? this.prisma.task.count({
            where: {
              organizationId,
              archivedAt: null,
              status: { in: [...incomplete] },
              dueDate: { lt: today },
              ...taskScope,
            },
          })
        : Promise.resolve(null),
      can(PERMISSIONS.activityRead)
        ? this.prisma.followUp.count({
            where: {
              organizationId,
              status: 'PENDING',
              dueAt: { lt: inSevenDays },
              ...followUpScope,
            },
          })
        : Promise.resolve(null),
      can(PERMISSIONS.paymentRead)
        ? this.outstandingByCurrency(organizationId)
        : Promise.resolve(null),
    ]);

    return {
      data: {
        openLeads,
        activeProjects,
        tasksDueToday: dueToday,
        overdueTasks: overdue,
        upcomingFollowUps: followUps,
        outstandingBalances: balances,
      },
      meta: { dateStrategy: 'UTC date-only boundaries', generatedAt: new Date().toISOString() },
    };
  }

  async myTasks(principal: AuthenticatedPrincipal) {
    if (!principal.permissions.includes(PERMISSIONS.taskRead)) return [];
    return this.prisma.task.findMany({
      where: {
        organizationId: principal.organizationId,
        assigneeId: principal.userId,
        archivedAt: null,
        status: { in: [...incomplete] },
        dueDate: { not: null },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        status: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 8,
    });
  }

  async followUps(principal: AuthenticatedPrincipal) {
    if (!principal.permissions.includes(PERMISSIONS.activityRead)) return [];
    const organizationWide = principal.permissions.includes(PERMISSIONS.leadAssign);
    return this.prisma.followUp.findMany({
      where: {
        organizationId: principal.organizationId,
        status: 'PENDING',
        ...(organizationWide ? {} : { assignedToId: principal.userId }),
      },
      select: {
        id: true,
        dueAt: true,
        type: true,
        lead: { select: { id: true, title: true, company: { select: { id: true, name: true } } } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: 8,
    });
  }

  async recentActivity(principal: AuthenticatedPrincipal) {
    const allowed: string[] = [];
    if (principal.permissions.includes(PERMISSIONS.leadRead)) allowed.push('LEAD');
    if (principal.permissions.includes(PERMISSIONS.projectRead)) allowed.push('PROJECT', 'TASK');
    if (principal.permissions.includes(PERMISSIONS.quotationRead)) allowed.push('QUOTATION');
    if (principal.permissions.includes(PERMISSIONS.paymentRead)) allowed.push('PAYMENT', 'COMPANY');
    if (!allowed.length) return [];
    return this.prisma.activityLog.findMany({
      where: {
        organizationId: principal.organizationId,
        entityType: { in: allowed },
        action: {
          in: [
            'LEAD_STAGE_CHANGED',
            'LEAD_OWNER_CHANGED',
            'FOLLOW_UP_COMPLETED',
            'PROJECT_CREATED',
            'PROJECT_UPDATED',
            'TASK_COMPLETED',
            'QUOTATION_SENT',
            'QUOTATION_ACCEPTED',
            'PAYMENT_CREATED',
            'PAYMENT_ACTIVITY',
          ],
        },
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        metadata: true,
        createdAt: true,
        actor: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
  }

  private async outstandingByCurrency(organizationId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId, archivedAt: null, projectValue: { not: null } },
      select: { id: true, projectValue: true, currency: true },
    });
    const received = await this.prisma.payment.groupBy({
      by: ['projectId', 'currency'],
      where: { organizationId, archivedAt: null, projectId: { not: null } },
      _sum: { amount: true },
    });
    const paymentMap = new Map(
      received.map((row) => [
        `${row.projectId}:${row.currency}`,
        row._sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
    const totals = new Map<string, Prisma.Decimal>();
    for (const project of projects) {
      const outstanding = (project.projectValue ?? new Prisma.Decimal(0)).minus(
        paymentMap.get(`${project.id}:${project.currency}`) ?? 0,
      );
      totals.set(
        project.currency,
        (totals.get(project.currency) ?? new Prisma.Decimal(0)).plus(outstanding),
      );
    }
    return [...totals].map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
  }
}
