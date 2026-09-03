import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { utcToday, addUtcDays } from '../src/common/date-range';
import { PrismaService } from '../src/database/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const origin = 'http://localhost:3000';
const password = 'Operational-owner-password-2026!';
const body = <T>(response: request.Response) => response.body as T;
function csrfFrom(response: request.Response) {
  const cookie = (response.headers['set-cookie'] as unknown as string[]).find((value) =>
    value.startsWith('unicrm_csrf='),
  );
  if (!cookie) throw new Error('CSRF cookie was not set');
  return decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
}

describe('Milestone 6 operational APIs', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let orgA: string;
  let orgB: string;
  let ownerId: string;
  let staffId: string;
  let projectId: string;
  let companyId: string;
  let taskId: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let staffAgent: ReturnType<typeof request.agent>;
  let csrfA: string;
  const slugA = `ops-a-${crypto.randomUUID()}`;
  const slugB = `ops-b-${crypto.randomUUID()}`;

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
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, name] of [
      [slugA, 'Operations A'],
      [slugB, 'Operations B'],
    ] as const)
      await bootstrap.run({
        organizationName: name,
        organizationSlug: slug,
        adminEmail: `${slug}@example.test`,
        adminPassword: password,
        adminFirstName: 'Owner',
        adminLastName: name.at(-1)!,
      });
    const a = await prisma.organization.findUniqueOrThrow({
      where: { slug: slugA },
      include: { users: true },
    });
    const b = await prisma.organization.findUniqueOrThrow({ where: { slug: slugB } });
    orgA = a.id;
    orgB = b.id;
    ownerId = a.users[0]!.id;
    const staffRole = await prisma.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId: orgA, name: 'Staff' } },
    });
    const staffEmail = `${slugA}-staff@example.test`;
    staffId = (
      await prisma.user.create({
        data: {
          organizationId: orgA,
          firstName: 'Demo',
          lastName: 'Staff',
          email: staffEmail,
          normalizedEmail: staffEmail,
          passwordHash: await app.get(PasswordService).hash(password),
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          userRoles: { create: { roleId: staffRole.id } },
        },
      })
    ).id;
    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { organizationId: orgA, isWon: false, isLost: false },
      include: { pipeline: true },
      orderBy: { position: 'asc' },
    });
    const company = await prisma.company.create({
      data: {
        organizationId: orgA,
        name: 'Needle Nova',
        email: 'needle@example.test',
        createdById: ownerId,
      },
    });
    companyId = company.id;
    const contact = await prisma.contact.create({
      data: {
        organizationId: orgA,
        companyId,
        firstName: 'Needle',
        lastName: 'Contact',
        createdById: ownerId,
      },
    });
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgA,
        companyId,
        contactId: contact.id,
        title: 'Needle Lead',
        source: 'REFERRAL',
        estimatedValue: '1000',
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        ownerId,
        createdById: ownerId,
      },
    });
    const project = await prisma.project.create({
      data: {
        organizationId: orgA,
        companyId,
        name: 'Needle Project',
        status: 'IN_PROGRESS',
        projectValue: '1000',
        currency: 'BDT',
        projectManagerId: ownerId,
        createdById: ownerId,
      },
    });
    projectId = project.id;
    const today = utcToday();
    await prisma.task.createMany({
      data: [
        {
          organizationId: orgA,
          projectId,
          title: 'Needle due today',
          status: 'TODO',
          dueDate: today,
          assigneeId: ownerId,
          reporterId: ownerId,
          createdById: ownerId,
        },
        {
          organizationId: orgA,
          projectId,
          title: 'Needle overdue',
          status: 'IN_PROGRESS',
          dueDate: addUtcDays(today, -2),
          assigneeId: ownerId,
          reporterId: ownerId,
          createdById: ownerId,
        },
        {
          organizationId: orgA,
          projectId,
          title: 'Needle completed',
          status: 'COMPLETED',
          dueDate: addUtcDays(today, -3),
          completedAt: new Date(),
          assigneeId: ownerId,
          reporterId: ownerId,
          createdById: ownerId,
        },
      ],
    });
    await prisma.followUp.create({
      data: {
        organizationId: orgA,
        leadId: lead.id,
        dueAt: addUtcDays(today, 2),
        assignedToId: ownerId,
        createdById: ownerId,
      },
    });
    await prisma.quotation.create({
      data: {
        organizationId: orgA,
        quotationNumber: 'QT-NEEDLE',
        companyId,
        projectId,
        status: 'SENT',
        issueDate: today,
        currency: 'BDT',
        total: '1000',
        createdById: ownerId,
      },
    });
    await prisma.payment.create({
      data: {
        organizationId: orgA,
        companyId,
        projectId,
        amount: '250',
        currency: 'BDT',
        paymentDate: today,
        recordedById: ownerId,
      },
    });
    await prisma.company.create({ data: { organizationId: orgB, name: 'Needle Foreign' } });
    agentA = request.agent(server);
    agentB = request.agent(server);
    staffAgent = request.agent(server);
    csrfA = csrfFrom(
      await agentA
        .post('/api/v1/auth/login')
        .send({ email: `${slugA}@example.test`, password })
        .expect(200),
    );
    await agentB
      .post('/api/v1/auth/login')
      .send({ email: `${slugB}@example.test`, password })
      .expect(200);
    await staffAgent.post('/api/v1/auth/login').send({ email: staffEmail, password }).expect(200);
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    await app?.close();
  }, 30_000);

  it('returns real dashboard counts and Decimal-safe outstanding totals without tenant leakage', async () => {
    const response = await agentA.get('/api/v1/dashboard/summary').expect(200);
    const data = body<{
      data: {
        openLeads: number;
        activeProjects: number;
        tasksDueToday: number;
        overdueTasks: number;
        upcomingFollowUps: number;
        outstandingBalances: Array<{ currency: string; amount: string }>;
      };
    }>(response).data;
    expect(data).toMatchObject({
      openLeads: 1,
      activeProjects: 1,
      tasksDueToday: 1,
      overdueTasks: 1,
      upcomingFollowUps: 1,
    });
    expect(data.outstandingBalances).toContainEqual({ currency: 'BDT', amount: '750.00' });
    expect(
      body<{ data: { openLeads: number } }>(
        await agentB.get('/api/v1/dashboard/summary').expect(200),
      ).data.openLeads,
    ).toBe(0);
  });

  it('serves every required report and validates payment date filters', async () => {
    for (const report of [
      'lead-pipeline',
      'lead-conversion',
      'leads-by-source',
      'projects-by-status',
      'tasks-by-status',
      'overdue-tasks',
      'payments',
      'outstanding-balances',
    ])
      await agentA.get(`/api/v1/reports/${report}`).expect(200);
    await agentA.get('/api/v1/reports/payments?from=2026-09-03&to=2026-09-01').expect(400);
    const outstanding = body<{ data: Array<{ outstanding: string }> }>(
      await agentA.get('/api/v1/reports/outstanding-balances').expect(200),
    );
    expect(outstanding.data[0]!.outstanding).toBe('750.00');
  });

  it('searches all six categories with grouped limits and tenant isolation', async () => {
    const data = body<{ data: Record<string, unknown[]> }>(
      await agentA.get('/api/v1/search?q=Needle&limit=1').expect(200),
    ).data;
    for (const category of ['companies', 'contacts', 'leads', 'projects', 'tasks', 'quotations'])
      expect(data[category]).toHaveLength(1);
    const foreign = body<{ data: { companies: Array<{ name: string }> } }>(
      await agentB.get('/api/v1/search?q=Needle').expect(200),
    ).data.companies;
    expect(foreign.map((item) => item.name)).toEqual(['Needle Foreign']);
    await agentA.get('/api/v1/search?q=N').expect(400);
  });

  it('creates task-assignment notifications and enforces user ownership/read state', async () => {
    const created = body<{ data: { id: string } }>(
      await agentA
        .post('/api/v1/tasks')
        .set('origin', origin)
        .set('x-csrf-token', csrfA)
        .send({ projectId, title: 'Needle assigned task', assigneeId: staffId })
        .expect(201),
    ).data;
    taskId = created.id;
    const list = body<{ data: Array<{ id: string; entityId: string; readAt: string | null }> }>(
      await staffAgent.get('/api/v1/notifications?unread=true').expect(200),
    ).data;
    const notification = list.find((item) => item.entityId === taskId)!;
    expect(notification.readAt).toBeNull();
    expect(
      body<{ data: { count: number } }>(
        await staffAgent.get('/api/v1/notifications/unread-count').expect(200),
      ).data.count,
    ).toBeGreaterThan(0);
    await agentA
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('origin', origin)
      .set('x-csrf-token', csrfA)
      .expect(404);
    const staffLogin = await staffAgent
      .post('/api/v1/auth/login')
      .send({ email: `${slugA}-staff@example.test`, password })
      .expect(200);
    const staffCsrf = csrfFrom(staffLogin);
    await staffAgent
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('origin', origin)
      .set('x-csrf-token', staffCsrf)
      .expect(200);
    await staffAgent
      .post('/api/v1/notifications/read-all')
      .set('origin', origin)
      .set('x-csrf-token', staffCsrf)
      .expect(200);
    expect(
      body<{ data: { count: number } }>(
        await staffAgent.get('/api/v1/notifications/unread-count').expect(200),
      ).data.count,
    ).toBe(0);
  });

  it('generates scheduled task, follow-up, and project deadline notifications from real records', async () => {
    const today = utcToday();
    await prisma.task.create({
      data: {
        organizationId: orgA,
        projectId,
        title: 'Needle scheduled due soon',
        status: 'TODO',
        dueDate: addUtcDays(today, 1),
        assigneeId: ownerId,
        reporterId: ownerId,
        createdById: ownerId,
      },
    });
    await prisma.followUp.create({
      data: {
        organizationId: orgA,
        leadId: (await prisma.lead.findFirstOrThrow({ where: { organizationId: orgA } })).id,
        dueAt: today,
        assignedToId: ownerId,
        createdById: ownerId,
      },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { deadline: addUtcDays(today, 1) },
    });

    await app.get(NotificationsService).generateScheduled(today);

    const notifications = await prisma.notification.findMany({
      where: { organizationId: orgA, userId: ownerId },
      select: { type: true },
    });
    expect(notifications.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'TASK_OVERDUE',
        'TASK_DUE_SOON',
        'FOLLOW_UP_DUE',
        'PROJECT_DEADLINE_SOON',
      ]),
    );
  });
});
