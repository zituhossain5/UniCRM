import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PERMISSIONS } from '../auth/auth.constants';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { paginationMeta } from '../common/dto/list-query.dto';
import { PrismaService } from '../database/prisma.service';
import { ForecastQueryDto } from './dto/forecast.dto';

type ZonedParts = { year: number; month: number; day: number };
type SummaryRow = {
  currency: string;
  openPipeline: Prisma.Decimal | null;
  weightedPipeline: Prisma.Decimal | null;
  expectedThisMonth: Prisma.Decimal | null;
  expectedThisQuarter: Prisma.Decimal | null;
  wonThisMonth: Prisma.Decimal | null;
  lostThisMonth: Prisma.Decimal | null;
  averageDealSize: Prisma.Decimal | null;
};
type CloseRow = { won: number; lost: number; averageSalesCycleDays: Prisma.Decimal | null };
type StageRow = {
  id: string;
  name: string;
  pipelineName: string;
  currency: string;
  dealCount: number;
  totalValue: Prisma.Decimal | null;
  weightedValue: Prisma.Decimal | null;
};
type OwnerRow = {
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  currency: string;
  openDeals: number;
  pipelineValue: Prisma.Decimal | null;
  weightedValue: Prisma.Decimal | null;
  wonValue: Prisma.Decimal | null;
  wonCount: number;
  lostCount: number;
};
type TimelineRow = {
  period: Date;
  currency: string;
  value: Prisma.Decimal | null;
  weightedValue: Prisma.Decimal | null;
};
type DealRow = {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  ownerId: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  isWon: boolean;
  isLost: boolean;
  amount: Prisma.Decimal | null;
  currency: string;
  probability: number;
  weightedValue: Prisma.Decimal | null;
  expectedCloseDate: Date | null;
  daysInStage: number;
  daysSinceCreated: number;
};

const decimal = (value: Prisma.Decimal | null) => (value ?? new Prisma.Decimal(0)).toFixed(2);

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { day: read('day'), month: read('month'), year: read('year') };
}

function dateOnly(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function nextDate(value: Date) {
  return new Date(value.getTime() + 86_400_000);
}

@Injectable()
export class ForecastService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(principal: AuthenticatedPrincipal, query: ForecastQueryDto) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: principal.organizationId },
      select: { timezone: true },
    });
    const ownerId = this.ownerScope(principal, query.owner);
    await this.validateReferences(principal.organizationId, ownerId, query.pipeline, query.stage);
    const now = new Date();
    const current = zonedParts(now, organization.timezone);
    const monthStart = dateOnly(current.year, current.month, 1);
    const monthEnd = dateOnly(current.year, current.month + 1, 1);
    const quarterMonth = Math.floor((current.month - 1) / 3) * 3 + 1;
    const quarterStart = dateOnly(current.year, quarterMonth, 1);
    const quarterEnd = dateOnly(current.year, quarterMonth + 3, 1);
    const selected = this.selectedRange(query, current);
    const dimensions = this.dimensionConditions(principal.organizationId, ownerId, query);
    const dimensionSql = Prisma.join(dimensions, ' AND ');

    const [summaryRows, closeRows, stageRows, ownerRows, timelineRows, deals, totals] =
      await this.prisma.$transaction([
        this.prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
          SELECT d."currency",
            COALESCE(SUM(d."amount") FILTER (WHERE NOT s."is_won" AND NOT s."is_lost"), 0) AS "openPipeline",
            COALESCE(SUM(d."amount" * d."probability" / 100) FILTER (WHERE NOT s."is_won" AND NOT s."is_lost"), 0) AS "weightedPipeline",
            COALESCE(SUM(d."amount") FILTER (WHERE NOT s."is_won" AND NOT s."is_lost" AND d."expected_close_date" >= ${monthStart}::date AND d."expected_close_date" < ${monthEnd}::date), 0) AS "expectedThisMonth",
            COALESCE(SUM(d."amount") FILTER (WHERE NOT s."is_won" AND NOT s."is_lost" AND d."expected_close_date" >= ${quarterStart}::date AND d."expected_close_date" < ${quarterEnd}::date), 0) AS "expectedThisQuarter",
            COALESCE(SUM(d."amount") FILTER (WHERE s."is_won" AND (d."won_at" AT TIME ZONE ${organization.timezone}) >= ${monthStart}::date AND (d."won_at" AT TIME ZONE ${organization.timezone}) < ${monthEnd}::date), 0) AS "wonThisMonth",
            COALESCE(SUM(d."amount") FILTER (WHERE s."is_lost" AND (d."lost_at" AT TIME ZONE ${organization.timezone}) >= ${monthStart}::date AND (d."lost_at" AT TIME ZONE ${organization.timezone}) < ${monthEnd}::date), 0) AS "lostThisMonth",
            AVG(d."amount") FILTER (WHERE s."is_won" AND (d."won_at" AT TIME ZONE ${organization.timezone}) >= ${selected.start}::date AND (d."won_at" AT TIME ZONE ${organization.timezone}) < ${selected.end}::date) AS "averageDealSize"
          FROM "deals" d JOIN "pipeline_stages" s ON s."id" = d."stage_id"
          WHERE ${dimensionSql}
          GROUP BY d."currency" ORDER BY d."currency"
        `),
        this.prisma.$queryRaw<CloseRow[]>(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE s."is_won" AND (d."won_at" AT TIME ZONE ${organization.timezone}) >= ${selected.start}::date AND (d."won_at" AT TIME ZONE ${organization.timezone}) < ${selected.end}::date)::int AS "won",
            COUNT(*) FILTER (WHERE s."is_lost" AND (d."lost_at" AT TIME ZONE ${organization.timezone}) >= ${selected.start}::date AND (d."lost_at" AT TIME ZONE ${organization.timezone}) < ${selected.end}::date)::int AS "lost",
            AVG(EXTRACT(EPOCH FROM (d."won_at" - d."created_at")) / 86400) FILTER (WHERE s."is_won" AND (d."won_at" AT TIME ZONE ${organization.timezone}) >= ${selected.start}::date AND (d."won_at" AT TIME ZONE ${organization.timezone}) < ${selected.end}::date AND d."won_at" >= d."created_at") AS "averageSalesCycleDays"
          FROM "deals" d JOIN "pipeline_stages" s ON s."id" = d."stage_id"
          WHERE ${dimensionSql}
        `),
        this.prisma.$queryRaw<StageRow[]>(Prisma.sql`
          SELECT s."id", s."name", p."name" AS "pipelineName", d."currency",
            COUNT(*)::int AS "dealCount", COALESCE(SUM(d."amount"), 0) AS "totalValue",
            COALESCE(SUM(d."amount" * d."probability" / 100), 0) AS "weightedValue"
          FROM "deals" d JOIN "pipeline_stages" s ON s."id" = d."stage_id"
          JOIN "pipelines" p ON p."id" = d."pipeline_id"
          WHERE ${dimensionSql} AND NOT s."is_won" AND NOT s."is_lost"
            AND d."expected_close_date" >= ${selected.start}::date AND d."expected_close_date" < ${selected.end}::date
          GROUP BY s."id", s."name", s."position", p."name", d."currency"
          ORDER BY p."name", s."position", d."currency"
        `),
        this.prisma.$queryRaw<OwnerRow[]>(Prisma.sql`
          SELECT u."id", u."first_name" AS "firstName", u."last_name" AS "lastName", d."currency",
            COUNT(*) FILTER (WHERE NOT s."is_won" AND NOT s."is_lost" AND d."expected_close_date" >= ${selected.start}::date AND d."expected_close_date" < ${selected.end}::date)::int AS "openDeals",
            COALESCE(SUM(d."amount") FILTER (WHERE NOT s."is_won" AND NOT s."is_lost" AND d."expected_close_date" >= ${selected.start}::date AND d."expected_close_date" < ${selected.end}::date), 0) AS "pipelineValue",
            COALESCE(SUM(d."amount" * d."probability" / 100) FILTER (WHERE NOT s."is_won" AND NOT s."is_lost" AND d."expected_close_date" >= ${selected.start}::date AND d."expected_close_date" < ${selected.end}::date), 0) AS "weightedValue",
            COALESCE(SUM(d."amount") FILTER (WHERE s."is_won" AND (d."won_at" AT TIME ZONE ${organization.timezone}) >= ${selected.start}::date AND (d."won_at" AT TIME ZONE ${organization.timezone}) < ${selected.end}::date), 0) AS "wonValue",
            COUNT(*) FILTER (WHERE s."is_won" AND (d."won_at" AT TIME ZONE ${organization.timezone}) >= ${selected.start}::date AND (d."won_at" AT TIME ZONE ${organization.timezone}) < ${selected.end}::date)::int AS "wonCount",
            COUNT(*) FILTER (WHERE s."is_lost" AND (d."lost_at" AT TIME ZONE ${organization.timezone}) >= ${selected.start}::date AND (d."lost_at" AT TIME ZONE ${organization.timezone}) < ${selected.end}::date)::int AS "lostCount"
          FROM "deals" d JOIN "pipeline_stages" s ON s."id" = d."stage_id"
          LEFT JOIN "users" u ON u."id" = d."owner_id"
          WHERE ${dimensionSql}
          GROUP BY u."id", u."first_name", u."last_name", d."currency"
          ORDER BY u."first_name" NULLS LAST, u."last_name" NULLS LAST, d."currency"
        `),
        this.prisma.$queryRaw<TimelineRow[]>(Prisma.sql`
          SELECT date_trunc(${query.groupBy}, d."expected_close_date"::timestamp) AS "period", d."currency",
            COALESCE(SUM(d."amount"), 0) AS "value",
            COALESCE(SUM(d."amount" * d."probability" / 100), 0) AS "weightedValue"
          FROM "deals" d JOIN "pipeline_stages" s ON s."id" = d."stage_id"
          WHERE ${dimensionSql} AND NOT s."is_won" AND NOT s."is_lost"
            AND d."expected_close_date" >= ${selected.start}::date AND d."expected_close_date" < ${selected.end}::date
          GROUP BY 1, d."currency" ORDER BY 1, d."currency"
        `),
        this.dealRows(dimensionSql, query, selected),
        this.dealCount(dimensionSql, query, selected),
      ]);
    const close = closeRows[0] ?? { won: 0, lost: 0, averageSalesCycleDays: null };
    const closed = close.won + close.lost;
    return {
      data: {
        summary: {
          currencies: summaryRows.map((row) => ({
            currency: row.currency,
            openPipeline: decimal(row.openPipeline),
            weightedPipeline: decimal(row.weightedPipeline),
            expectedThisMonth: decimal(row.expectedThisMonth),
            expectedThisQuarter: decimal(row.expectedThisQuarter),
            wonThisMonth: decimal(row.wonThisMonth),
            lostThisMonth: decimal(row.lostThisMonth),
            averageDealSize: row.averageDealSize?.toFixed(2) ?? null,
          })),
          won: close.won,
          lost: close.lost,
          winRate: closed ? Number(((close.won * 100) / closed).toFixed(1)) : null,
          averageSalesCycleDays: close.averageSalesCycleDays
            ? Number(close.averageSalesCycleDays.toFixed(1))
            : null,
        },
        byStage: stageRows.map((row) => ({
          ...row,
          totalValue: decimal(row.totalValue),
          weightedValue: decimal(row.weightedValue),
        })),
        byOwner: ownerRows.map((row) => ({
          ...row,
          pipelineValue: decimal(row.pipelineValue),
          weightedValue: decimal(row.weightedValue),
          wonValue: decimal(row.wonValue),
          winRate:
            row.wonCount + row.lostCount
              ? Number(((row.wonCount * 100) / (row.wonCount + row.lostCount)).toFixed(1))
              : null,
        })),
        timeline: timelineRows.map((row) => ({
          period: row.period,
          currency: row.currency,
          value: decimal(row.value),
          weightedValue: decimal(row.weightedValue),
        })),
        deals: deals.map((row) => ({
          ...row,
          amount: row.amount?.toFixed(2) ?? null,
          weightedValue: row.weightedValue?.toFixed(2) ?? null,
        })),
      },
      meta: {
        ...paginationMeta(Number(query.page), Number(query.limit), totals[0]?.count ?? 0),
        range: { from: selected.start.toISOString(), to: selected.end.toISOString() },
        timezone: organization.timezone,
        visibility: principal.permissions.includes(PERMISSIONS.forecastReadAll)
          ? 'organization'
          : 'own',
        winRateFormula: 'Won / (Won + Lost)',
      },
    };
  }

  async dashboard(principal: AuthenticatedPrincipal) {
    if (!principal.permissions.includes(PERMISSIONS.forecastRead)) return null;
    const result = await this.get(principal, new ForecastQueryDto());
    return {
      currencies: result.data.summary.currencies.map(
        ({ currency, weightedPipeline, expectedThisMonth }) => ({
          currency,
          weightedPipeline,
          expectedThisMonth,
        }),
      ),
      winRate: result.data.summary.winRate,
    };
  }

  private ownerScope(principal: AuthenticatedPrincipal, requested?: string) {
    if (principal.permissions.includes(PERMISSIONS.forecastReadAll)) return requested;
    if (requested && requested !== principal.userId)
      throw new ForbiddenException('Forecast access is limited to owned deals');
    return principal.userId;
  }

  private async validateReferences(
    organizationId: string,
    ownerId?: string,
    pipelineId?: string,
    stageId?: string,
  ) {
    const [owner, pipeline, stage] = await Promise.all([
      ownerId
        ? this.prisma.user.findFirst({
            where: { id: ownerId, organizationId },
            select: { id: true },
          })
        : null,
      pipelineId
        ? this.prisma.pipeline.findFirst({
            where: { id: pipelineId, organizationId, entityType: 'DEAL', archivedAt: null },
            select: { id: true },
          })
        : null,
      stageId
        ? this.prisma.pipelineStage.findFirst({
            where: { id: stageId, organizationId, pipeline: { entityType: 'DEAL' } },
            select: { id: true, pipelineId: true },
          })
        : null,
    ]);
    if (ownerId && !owner) throw new BadRequestException('Owner is invalid or unavailable');
    if (pipelineId && !pipeline)
      throw new BadRequestException('Pipeline is invalid or unavailable');
    if (stageId && !stage) throw new BadRequestException('Stage is invalid or unavailable');
    if (pipelineId && stage && stage.pipelineId !== pipelineId)
      throw new BadRequestException('Stage does not belong to the selected pipeline');
  }

  private selectedRange(query: ForecastQueryDto, current: ZonedParts) {
    if (query.period === 'custom') {
      if (!query.from || !query.to)
        throw new BadRequestException('Custom range requires from and to');
      const start = new Date(query.from);
      const inclusiveEnd = new Date(query.to);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(inclusiveEnd.getTime()) ||
        start > inclusiveEnd
      )
        throw new BadRequestException('Forecast date range is invalid');
      return { start, end: nextDate(inclusiveEnd) };
    }
    if (query.period === 'quarter') {
      const month = Math.floor((current.month - 1) / 3) * 3 + 1;
      return { start: dateOnly(current.year, month, 1), end: dateOnly(current.year, month + 3, 1) };
    }
    return {
      start: dateOnly(current.year, current.month, 1),
      end: dateOnly(current.year, current.month + 1, 1),
    };
  }

  private dimensionConditions(
    organizationId: string,
    ownerId: string | undefined,
    query: ForecastQueryDto,
  ) {
    return [
      Prisma.sql`d."organization_id" = ${organizationId}::uuid`,
      Prisma.sql`d."archived_at" IS NULL`,
      ...(ownerId ? [Prisma.sql`d."owner_id" = ${ownerId}::uuid`] : []),
      ...(query.pipeline ? [Prisma.sql`d."pipeline_id" = ${query.pipeline}::uuid`] : []),
      ...(query.stage ? [Prisma.sql`d."stage_id" = ${query.stage}::uuid`] : []),
    ];
  }

  private dealFilters(query: ForecastQueryDto, selected: { start: Date; end: Date }) {
    return [
      Prisma.sql`d."expected_close_date" >= ${selected.start}::date`,
      Prisma.sql`d."expected_close_date" < ${selected.end}::date`,
      ...(query.state === 'open' ? [Prisma.sql`NOT s."is_won" AND NOT s."is_lost"`] : []),
      ...(query.state === 'won' ? [Prisma.sql`s."is_won"`] : []),
      ...(query.state === 'lost' ? [Prisma.sql`s."is_lost"`] : []),
      ...(query.search?.trim()
        ? [
            Prisma.sql`(d."name" ILIKE ${`%${query.search.trim()}%`} OR c."name" ILIKE ${`%${query.search.trim()}%`})`,
          ]
        : []),
    ];
  }

  private dealRows(
    dimensionSql: Prisma.Sql,
    query: ForecastQueryDto,
    selected: { start: Date; end: Date },
  ) {
    const sortColumns: Record<string, string> = {
      name: 'd."name"',
      amount: 'd."amount"',
      probability: 'd."probability"',
      weightedValue: '"weightedValue"',
      expectedCloseDate: 'd."expected_close_date"',
      daysInStage: '"daysInStage"',
    };
    const direction = query.order === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
    const offset = (Number(query.page) - 1) * Number(query.limit);
    return this.prisma.$queryRaw<DealRow[]>(Prisma.sql`
      SELECT d."id", d."name", c."id" AS "companyId", c."name" AS "companyName",
        u."id" AS "ownerId", u."first_name" AS "ownerFirstName", u."last_name" AS "ownerLastName",
        p."id" AS "pipelineId", p."name" AS "pipelineName", s."id" AS "stageId", s."name" AS "stageName",
        s."is_won" AS "isWon", s."is_lost" AS "isLost", d."amount", d."currency", d."probability",
        d."amount" * d."probability" / 100 AS "weightedValue", d."expected_close_date" AS "expectedCloseDate",
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(last_stage."changedAt", d."created_at"))) / 86400))::int AS "daysInStage",
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - d."created_at")) / 86400))::int AS "daysSinceCreated"
      FROM "deals" d JOIN "companies" c ON c."id" = d."company_id"
      JOIN "pipelines" p ON p."id" = d."pipeline_id" JOIN "pipeline_stages" s ON s."id" = d."stage_id"
      LEFT JOIN "users" u ON u."id" = d."owner_id"
      LEFT JOIN LATERAL (
        SELECT MAX(a."created_at") AS "changedAt" FROM "activity_logs" a
        WHERE a."organization_id" = d."organization_id" AND a."entity_type" = 'DEAL'
          AND a."entity_id" = d."id" AND a."action" IN ('DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_WON', 'DEAL_LOST')
      ) last_stage ON true
      WHERE ${dimensionSql} AND ${Prisma.join(this.dealFilters(query, selected), ' AND ')}
      ORDER BY ${Prisma.raw(sortColumns[query.sort] ?? sortColumns.expectedCloseDate!)} ${direction} NULLS LAST, d."id" ASC
      LIMIT ${Number(query.limit)} OFFSET ${offset}
    `);
  }

  private dealCount(
    dimensionSql: Prisma.Sql,
    query: ForecastQueryDto,
    selected: { start: Date; end: Date },
  ) {
    return this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count" FROM "deals" d JOIN "companies" c ON c."id" = d."company_id"
      JOIN "pipeline_stages" s ON s."id" = d."stage_id"
      WHERE ${dimensionSql} AND ${Prisma.join(this.dealFilters(query, selected), ' AND ')}
    `);
  }
}
