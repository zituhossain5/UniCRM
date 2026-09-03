import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { parseDateOnly, utcToday } from '../common/date-range';
import { paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import type { ReportFilterDto } from './dto/reports.dto';

const incomplete = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'] as const;

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  leadPipeline(principal: AuthenticatedPrincipal, query: ReportFilterDto) {
    const where = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.owner ? { ownerId: query.owner } : {}),
    };
    return this.prisma.pipelineStage
      .findMany({
        where: { organizationId: principal.organizationId },
        select: {
          id: true,
          name: true,
          position: true,
          isWon: true,
          isLost: true,
          leads: { where, select: { estimatedValue: true, currency: true } },
        },
        orderBy: { position: 'asc' },
      })
      .then((stages) => ({
        data: stages.map((stage) => ({
          ...stage,
          leads: undefined,
          count: stage.leads.length,
          values: this.sumByCurrency(
            stage.leads.map((lead) => ({ amount: lead.estimatedValue, currency: lead.currency })),
          ),
        })),
      }));
  }

  async leadConversion(principal: AuthenticatedPrincipal, query: ReportFilterDto) {
    const base = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.owner ? { ownerId: query.owner } : {}),
    };
    const [won, lost] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { ...base, stage: { isWon: true } } }),
      this.prisma.lead.count({ where: { ...base, stage: { isLost: true } } }),
    ]);
    const closed = won + lost;
    return {
      data: {
        won,
        lost,
        closed,
        conversionPercent: closed ? Number(((won * 100) / closed).toFixed(1)) : null,
      },
      meta: { formula: 'Won leads / (Won leads + Lost leads)' },
    };
  }

  async leadsBySource(principal: AuthenticatedPrincipal, query: ReportFilterDto) {
    const rows = await this.prisma.lead.groupBy({
      by: ['source', 'currency'],
      where: {
        organizationId: principal.organizationId,
        archivedAt: null,
        ...(query.owner ? { ownerId: query.owner } : {}),
      },
      _count: { _all: true },
      _sum: { estimatedValue: true },
      orderBy: { source: 'asc' },
    });
    return {
      data: rows.map((row) => ({
        source: row.source ?? 'UNSPECIFIED',
        currency: row.currency,
        count: row._count._all,
        estimatedValue: (row._sum.estimatedValue ?? new Prisma.Decimal(0)).toFixed(2),
      })),
    };
  }

  async projectsByStatus(principal: AuthenticatedPrincipal, query: ReportFilterDto) {
    const rows = await this.prisma.project.groupBy({
      by: ['status', 'currency'],
      where: {
        organizationId: principal.organizationId,
        archivedAt: null,
        ...(query.company ? { companyId: query.company } : {}),
      },
      _count: { _all: true },
      _sum: { projectValue: true },
      orderBy: { status: 'asc' },
    });
    return {
      data: rows.map((row) => ({
        status: row.status,
        currency: row.currency,
        count: row._count._all,
        value: (row._sum.projectValue ?? new Prisma.Decimal(0)).toFixed(2),
      })),
    };
  }

  async tasksByStatus(principal: AuthenticatedPrincipal, query: ReportFilterDto) {
    const rows = await this.prisma.task.groupBy({
      by: ['status'],
      where: {
        organizationId: principal.organizationId,
        archivedAt: null,
        ...(query.assignee ? { assigneeId: query.assignee } : {}),
        ...(query.project ? { projectId: query.project } : {}),
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
    return { data: rows.map((row) => ({ status: row.status, count: row._count._all })) };
  }

  async overdueTasks(principal: AuthenticatedPrincipal, query: ReportFilterDto) {
    const { page, limit } = this.page(query);
    const today = utcToday();
    const where: Prisma.TaskWhereInput = {
      organizationId: principal.organizationId,
      archivedAt: null,
      status: { in: [...incomplete] },
      dueDate: { lt: today },
      ...(query.assignee ? { assigneeId: query.assignee } : {}),
      ...(query.project ? { projectId: query.project } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          priority: true,
          dueDate: true,
          status: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        daysOverdue: Math.floor((today.getTime() - row.dueDate!.getTime()) / 86_400_000),
      })),
      meta: paginationMeta(page, limit, total),
    };
  }

  async payments(principal: AuthenticatedPrincipal, query: ReportFilterDto) {
    const { page, limit } = this.page(query);
    this.validateRange(query);
    const where = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.company ? { companyId: query.company } : {}),
      ...(query.project ? { projectId: query.project } : {}),
      ...this.dateFilter(query, 'paymentDate'),
    };
    const [rows, total, sums] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          currency: true,
          method: true,
          reference: true,
          company: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where,
        _sum: { amount: true },
        orderBy: { currency: 'asc' },
      }),
    ]);
    return {
      data: rows,
      totals: sums.map((sum) => ({
        currency: sum.currency,
        amount: (sum._sum?.amount ?? new Prisma.Decimal(0)).toFixed(2),
      })),
      meta: paginationMeta(page, limit, total),
    };
  }

  async outstandingBalances(principal: AuthenticatedPrincipal, query: ReportFilterDto) {
    const { page, limit } = this.page(query);
    const where = {
      organizationId: principal.organizationId,
      archivedAt: null,
      ...(query.company ? { companyId: query.company } : {}),
      ...(query.project ? { id: query.project } : {}),
    };
    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        select: {
          id: true,
          name: true,
          projectValue: true,
          currency: true,
          company: { select: { id: true, name: true } },
          payments: { where: { archivedAt: null }, select: { amount: true, currency: true } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);
    return {
      data: projects.map((project) => {
        const received = project.payments.reduce(
          (sum, payment) =>
            payment.currency === project.currency ? sum.plus(payment.amount) : sum,
          new Prisma.Decimal(0),
        );
        const value = project.projectValue ?? new Prisma.Decimal(0);
        return {
          id: project.id,
          name: project.name,
          company: project.company,
          currency: project.currency,
          projectValue: value.toFixed(2),
          received: received.toFixed(2),
          outstanding: value.minus(received).toFixed(2),
        };
      }),
      meta: paginationMeta(page, limit, total),
    };
  }

  private sumByCurrency(rows: Array<{ amount: Prisma.Decimal | null; currency: string }>) {
    const sums = new Map<string, Prisma.Decimal>();
    for (const row of rows)
      sums.set(
        row.currency,
        (sums.get(row.currency) ?? new Prisma.Decimal(0)).plus(row.amount ?? 0),
      );
    return [...sums].map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
  }
  private page(query: ReportFilterDto) {
    return { page: Number(query.page ?? 1), limit: Number(query.limit ?? 25) };
  }
  private validateRange(query: ReportFilterDto) {
    if (query.from && query.to && parseDateOnly(query.from) > parseDateOnly(query.to))
      throw new BadRequestException('from must not be after to');
  }
  private dateFilter(query: ReportFilterDto, field: string) {
    const range =
      query.from || query.to
        ? {
            [field]: {
              ...(query.from ? { gte: parseDateOnly(query.from) } : {}),
              ...(query.to ? { lte: parseDateOnly(query.to) } : {}),
            },
          }
        : {};
    return range;
  }
}
