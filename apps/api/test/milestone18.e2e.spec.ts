import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';

const origin = 'http://localhost:3000';
const password = 'Milestone-18-owner-password!';
const body = <T>(response: request.Response) => response.body as T;
const csrfFrom = (response: request.Response) => {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith('unicrm_csrf='));
  if (!cookie) throw new Error('CSRF cookie was not set');
  return decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
};

type ForecastBody = {
  data: {
    summary: {
      currencies: Array<{
        currency: string;
        openPipeline: string;
        weightedPipeline: string;
        expectedThisMonth: string;
        expectedThisQuarter: string;
      }>;
      won: number;
      lost: number;
      winRate: number | null;
    };
    byStage: Array<{ dealCount: number; totalValue: string; weightedValue: string }>;
    byOwner: Array<{ openDeals: number; pipelineValue: string; weightedValue: string }>;
    timeline: Array<{ weightedValue: string }>;
    deals: Array<{ name: string; daysInStage: number; daysSinceCreated: number }>;
  };
  meta: { visibility: string; total: number };
};

describe('Milestone 18 sales forecasting', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;
  let ownerId: string;
  let staffId: string;
  let otherOwnerId: string;
  let ownerAgent: ReturnType<typeof request.agent>;
  let staffAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '100';
    process.env.CORS_ORIGINS = origin;
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    const suffix = crypto.randomUUID();
    const bootstrap = app.get(IdentityBootstrapService);
    await bootstrap.run({
      organizationName: 'Forecast A',
      organizationSlug: `forecast-a-${suffix}`,
      adminEmail: `forecast-a-${suffix}@example.test`,
      adminPassword: password,
      adminFirstName: 'Owner',
      adminLastName: 'Forecast',
    });
    await bootstrap.run({
      organizationName: 'Forecast B',
      organizationSlug: `forecast-b-${suffix}`,
      adminEmail: `forecast-b-${suffix}@example.test`,
      adminPassword: password,
      adminFirstName: 'Other',
      adminLastName: 'Owner',
    });
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: `forecast-a-${suffix}` },
      include: { users: true },
    });
    const other = await prisma.organization.findUniqueOrThrow({
      where: { slug: `forecast-b-${suffix}` },
      include: { users: true },
    });
    organizationId = organization.id;
    otherOrganizationId = other.id;
    ownerId = organization.users[0]!.id;
    otherOwnerId = other.users[0]!.id;
    const staffRole = await prisma.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId, name: 'Staff' } },
    });
    const staffEmail = `forecast-staff-${suffix}@example.test`;
    const staff = await prisma.user.create({
      data: {
        organizationId,
        firstName: 'Sales',
        lastName: 'Staff',
        email: staffEmail,
        normalizedEmail: staffEmail,
        passwordHash: await app.get(PasswordService).hash(password),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: { roleId: staffRole.id } },
      },
    });
    staffId = staff.id;
    const company = await prisma.company.create({
      data: { organizationId, name: 'Forecast Customer', createdById: ownerId },
    });
    const otherCompany = await prisma.company.create({
      data: {
        organizationId: otherOrganizationId,
        name: 'Other Forecast',
        createdById: otherOwnerId,
      },
    });
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId, entityType: 'DEAL', isDefault: true },
      include: { stages: true },
    });
    const otherPipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: otherOrganizationId, entityType: 'DEAL', isDefault: true },
      include: { stages: true },
    });
    const open = pipeline.stages.find((stage) => !stage.isWon && !stage.isLost)!;
    const won = pipeline.stages.find((stage) => stage.isWon)!;
    const lost = pipeline.stages.find((stage) => stage.isLost)!;
    const otherOpen = otherPipeline.stages.find((stage) => !stage.isWon && !stage.isLost)!;
    const now = new Date();
    const expectedCloseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
    const common = {
      organizationId,
      companyId: company.id,
      ownerId: staffId,
      pipelineId: pipeline.id,
      currency: 'BDT',
      createdById: ownerId,
    };
    await prisma.deal.createMany({
      data: [
        {
          ...common,
          name: 'Deal A',
          stageId: open.id,
          amount: '100000',
          probability: 50,
          expectedCloseDate,
        },
        {
          ...common,
          name: 'Deal B',
          stageId: open.id,
          amount: '200000',
          probability: 75,
          expectedCloseDate,
        },
        {
          ...common,
          name: 'Deal C',
          stageId: won.id,
          amount: '150000',
          probability: 100,
          expectedCloseDate,
          wonAt: now,
        },
        {
          ...common,
          name: 'Deal D',
          stageId: lost.id,
          amount: '80000',
          probability: 0,
          expectedCloseDate,
          lostAt: now,
        },
        {
          ...common,
          ownerId,
          name: 'Owner-only deal',
          stageId: open.id,
          amount: '400000',
          probability: 25,
          expectedCloseDate,
        },
        {
          ...common,
          name: 'Deal precision',
          stageId: open.id,
          amount: '0.01',
          currency: 'USD',
          probability: 50,
          expectedCloseDate,
        },
      ],
    });
    await prisma.deal.create({
      data: {
        organizationId: otherOrganizationId,
        companyId: otherCompany.id,
        ownerId: otherOwnerId,
        pipelineId: otherPipeline.id,
        stageId: otherOpen.id,
        name: 'Cross tenant deal',
        amount: '999999',
        probability: 100,
        expectedCloseDate,
        createdById: otherOwnerId,
      },
    });
    ownerAgent = request.agent(server);
    staffAgent = request.agent(server);
    csrfFrom(
      await ownerAgent
        .post('/api/v1/auth/login')
        .send({ email: `forecast-a-${suffix}@example.test`, password })
        .expect(200),
    );
    csrfFrom(
      await staffAgent.post('/api/v1/auth/login').send({ email: staffEmail, password }).expect(200),
    );
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationId, otherOrganizationId].filter(Boolean) } },
      });
    await app?.close();
  }, 30_000);

  it('calculates Decimal-safe open, weighted, expected, won/lost, and win-rate totals', async () => {
    const result = body<ForecastBody>(await staffAgent.get('/api/v1/forecast').expect(200));
    const bdt = result.data.summary.currencies.find(({ currency }) => currency === 'BDT')!;
    expect(bdt.openPipeline).toBe('300000.00');
    expect(bdt.weightedPipeline).toBe('200000.00');
    expect(bdt.expectedThisMonth).toBe('300000.00');
    expect(bdt.expectedThisQuarter).toBe('300000.00');
    expect(
      result.data.summary.currencies.find(({ currency }) => currency === 'USD')?.weightedPipeline,
    ).toBe('0.01');
    expect(result.data.summary).toMatchObject({ won: 1, lost: 1, winRate: 50 });
    expect(result.meta.visibility).toBe('own');
  });

  it('returns stage, owner, timeline, drill-down and aging data from the same scope', async () => {
    const result = body<ForecastBody>(await staffAgent.get('/api/v1/forecast').expect(200));
    expect(result.data.byStage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dealCount: 2,
          totalValue: '300000.00',
          weightedValue: '200000.00',
        }),
      ]),
    );
    expect(result.data.byOwner).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          openDeals: 2,
          pipelineValue: '300000.00',
          weightedValue: '200000.00',
        }),
      ]),
    );
    expect(result.data.timeline[0]?.weightedValue).toBe('200000.00');
    expect(
      result.data.deals.every((deal) => deal.daysInStage >= 0 && deal.daysSinceCreated >= 0),
    ).toBe(true);
  });

  it('returns a null win rate for a selected range without closed deals', async () => {
    const result = body<ForecastBody>(
      await staffAgent
        .get('/api/v1/forecast?period=custom&from=2099-01-01&to=2099-01-31')
        .expect(200),
    );
    expect(result.data.summary.winRate).toBeNull();
  });

  it('enforces own-deal visibility and rejects cross-tenant filter references', async () => {
    const ownerResult = body<ForecastBody>(await ownerAgent.get('/api/v1/forecast').expect(200));
    expect(ownerResult.data.summary.currencies[0]!.openPipeline).toBe('700000.00');
    expect(ownerResult.meta.visibility).toBe('organization');
    await staffAgent.get(`/api/v1/forecast?owner=${ownerId}`).expect(403);
    await ownerAgent.get(`/api/v1/forecast?owner=${otherOwnerId}`).expect(400);
  });
});
