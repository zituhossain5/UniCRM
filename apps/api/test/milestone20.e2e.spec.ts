import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service';
import { RateLimitService } from '../src/auth/rate-limit.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';
import { JobsService } from '../src/jobs/jobs.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const origin = 'http://localhost:3000';
const password = 'Milestone-20-owner-password!';
const body = <T>(response: request.Response) => response.body as T;
function csrfFrom(response: request.Response) {
  const cookie = (response.headers['set-cookie'] as unknown as string[]).find((value) =>
    value.startsWith('unicrm_csrf='),
  );
  if (!cookie) throw new Error('CSRF cookie was not set');
  return decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
}
function mutate(
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  method: 'delete' | 'patch' | 'post',
  path: string,
) {
  return agent[method](path).set('origin', origin).set('x-csrf-token', csrf);
}
class TestJobsService {
  enqueueMailboxSync() {
    return Promise.resolve();
  }
  enqueueCrmEmail() {
    return Promise.resolve();
  }
  enqueueEmail() {
    return Promise.resolve();
  }
  enqueueIntegrationEvent() {
    return Promise.resolve();
  }
  enqueueWebhookDelivery() {
    return Promise.resolve();
  }
  enqueueAutomationRun() {
    return Promise.resolve();
  }
}

describe('Milestone 20 customer cases', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let orgA = '';
  let orgB = '';
  let ownerA = '';
  let ownerB = '';
  let staffA = '';
  let companyA = '';
  let contactA = '';
  let leadA = '';
  let dealA = '';
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;
  let staffAgent: ReturnType<typeof request.agent>;
  let csrfA = '';
  let viewerCsrf = '';
  let staffCsrf = '';

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '100';
    process.env.CORS_ORIGINS = origin;
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JobsService)
      .useClass(TestJobsService)
      .overrideProvider(RateLimitService)
      .useValue({ consume: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);
    const suffix = crypto.randomUUID();
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, name] of [
      [`cases-a-${suffix}`, 'Cases A'],
      [`cases-b-${suffix}`, 'Cases B'],
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
      where: { slug: `cases-a-${suffix}` },
      include: { users: true },
    });
    const b = await prisma.organization.findUniqueOrThrow({
      where: { slug: `cases-b-${suffix}` },
      include: { users: true },
    });
    orgA = a.id;
    ownerA = a.users[0]!.id;
    orgB = b.id;
    ownerB = b.users[0]!.id;
    const viewerRole = await prisma.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId: orgA, name: 'Viewer' } },
    });
    const staffRole = await prisma.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId: orgA, name: 'Staff' } },
    });
    const viewerEmail = `cases-viewer-${suffix}@example.test`;
    await prisma.user.create({
      data: {
        organizationId: orgA,
        firstName: 'Case',
        lastName: 'Viewer',
        email: viewerEmail,
        normalizedEmail: viewerEmail,
        passwordHash: await app.get(PasswordService).hash(password),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: { roleId: viewerRole.id } },
      },
    });
    const staffEmail = `cases-staff-${suffix}@example.test`;
    staffA = (
      await prisma.user.create({
        data: {
          organizationId: orgA,
          firstName: 'Case',
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
    const company = await prisma.company.create({
      data: { organizationId: orgA, createdById: ownerA, name: 'ABC Customer' },
    });
    companyA = company.id;
    contactA = (
      await prisma.contact.create({
        data: {
          organizationId: orgA,
          createdById: ownerA,
          companyId: companyA,
          firstName: 'Amina',
          lastName: 'Customer',
          email: 'amina@example.test',
          normalizedEmail: 'amina@example.test',
        },
      })
    ).id;
    const leadPipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgA, entityType: 'LEAD', isDefault: true },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    leadA = (
      await prisma.lead.create({
        data: {
          organizationId: orgA,
          createdById: ownerA,
          companyId: companyA,
          contactId: contactA,
          title: 'ABC inquiry',
          pipelineId: leadPipeline.id,
          stageId: leadPipeline.stages[0]!.id,
        },
      })
    ).id;
    const dealPipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgA, entityType: 'DEAL', isDefault: true },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    dealA = (
      await prisma.deal.create({
        data: {
          organizationId: orgA,
          createdById: ownerA,
          companyId: companyA,
          contactId: contactA,
          name: 'ABC support deal',
          pipelineId: dealPipeline.id,
          stageId: dealPipeline.stages[0]!.id,
        },
      })
    ).id;
    agentA = request.agent(server);
    agentB = request.agent(server);
    viewerAgent = request.agent(server);
    staffAgent = request.agent(server);
    csrfA = csrfFrom(
      await agentA
        .post('/api/v1/auth/login')
        .send({ email: `cases-a-${suffix}@example.test`, password })
        .expect(200),
    );
    await agentB
      .post('/api/v1/auth/login')
      .send({ email: `cases-b-${suffix}@example.test`, password })
      .expect(200);
    viewerCsrf = csrfFrom(
      await viewerAgent
        .post('/api/v1/auth/login')
        .send({ email: viewerEmail, password })
        .expect(200),
    );
    staffCsrf = csrfFrom(
      await staffAgent.post('/api/v1/auth/login').send({ email: staffEmail, password }).expect(200),
    );
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    await app?.close();
  }, 30_000);

  it('creates sequential tenant-scoped cases, validates relationships, RBAC, views, and automation triggers', async () => {
    await mutate(agentA, csrfA, 'post', '/api/v1/automations')
      .send({
        name: 'Notify on new case',
        entityType: 'CASE',
        triggerType: 'CASE_CREATED',
        conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH' }],
        actions: [{ type: 'CREATE_NOTIFICATION', ownerId: ownerA, title: 'New high case' }],
      })
      .expect(201);
    const created = body<{ data: { id: string; caseNumber: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/cases')
        .send({
          title: 'Customer cannot access service',
          description: 'Account access issue',
          type: 'TECHNICAL_ISSUE',
          priority: 'HIGH',
          assignedUserId: ownerA,
          companyId: companyA,
          contactId: contactA,
          leadId: leadA,
          dealId: dealA,
          dueAt: new Date(Date.now() - 60_000).toISOString(),
        })
        .expect(201),
    ).data;
    expect(created.caseNumber).toBe('CS-000001');
    const second = body<{ data: { caseNumber: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/cases')
        .send({ title: 'Second case' })
        .expect(201),
    ).data;
    expect(second.caseNumber).toBe('CS-000002');
    const related = body<{ data: Array<{ id: string }> }>(
      await agentA.get(`/api/v1/cases?contact=${contactA}`).expect(200),
    );
    expect(related.data.map(({ id }) => id)).toContain(created.id);
    expect(
      await prisma.automationRun.count({ where: { entityType: 'CASE', entityId: created.id } }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { entityId: created.id, type: 'CASE_ASSIGNED' } }),
    ).toBe(1);
    await mutate(agentA, csrfA, 'post', '/api/v1/cases')
      .send({ title: 'Cross tenant', assignedUserId: ownerB })
      .expect(400);
    await agentB.get(`/api/v1/cases/${created.id}`).expect(404);
    await viewerAgent.get(`/api/v1/cases/${created.id}`).expect(200);
    await mutate(viewerAgent, viewerCsrf, 'post', '/api/v1/cases')
      .send({ title: 'Denied' })
      .expect(403);
    await mutate(staffAgent, staffCsrf, 'patch', `/api/v1/cases/${created.id}`)
      .send({ title: 'Staff-updated title' })
      .expect(200);
    await mutate(staffAgent, staffCsrf, 'patch', `/api/v1/cases/${created.id}`)
      .send({ assignedUserId: staffA })
      .expect(403);
    await mutate(staffAgent, staffCsrf, 'patch', `/api/v1/cases/${created.id}`)
      .send({ status: 'RESOLVED' })
      .expect(403);
  });

  it('preserves lifecycle history and reuses comments, tasks, attachments, and idempotent reminders', async () => {
    const record = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/cases')
        .send({
          title: 'Lifecycle case',
          assignedUserId: ownerA,
          priority: 'URGENT',
          dueAt: new Date(Date.now() - 120_000).toISOString(),
        })
        .expect(201),
    ).data;
    for (const status of ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'OPEN', 'CLOSED'])
      await mutate(agentA, csrfA, 'patch', `/api/v1/cases/${record.id}`)
        .send({ status })
        .expect(200);
    await mutate(agentA, csrfA, 'post', `/api/v1/cases/${record.id}/comments`)
      .send({ content: 'Customer confirmed the issue details.' })
      .expect(201);
    const task = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/cases/${record.id}/tasks`)
        .send({ title: 'Investigate customer issue', priority: 'HIGH' })
        .expect(201),
    ).data;
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).caseId).toBe(
      record.id,
    );
    const upload = await mutate(agentA, csrfA, 'post', `/api/v1/cases/${record.id}/attachments`)
      .attach('file', Buffer.from('safe evidence'), {
        filename: 'evidence.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    const attachmentId = body<{ data: { id: string } }>(upload).data.id;
    await agentA.get(`/api/v1/attachments/${attachmentId}/download`).expect(200);
    const actions = (
      await prisma.activityLog.findMany({ where: { entityType: 'CASE', entityId: record.id } })
    ).map(({ action }) => action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'CASE_STATUS_CHANGED',
        'CASE_RESOLVED',
        'CASE_REOPENED',
        'CASE_CLOSED',
        'CASE_COMMENT_ADDED',
        'CASE_TASK_CREATED',
      ]),
    );
    await mutate(agentA, csrfA, 'patch', `/api/v1/cases/${record.id}`)
      .send({ status: 'OPEN' })
      .expect(200);
    await notifications.generateScheduled();
    await notifications.generateScheduled();
    expect(
      await prisma.notification.count({ where: { entityId: record.id, type: 'CASE_DUE' } }),
    ).toBe(1);
  });

  it('creates a reviewed Case from Shared Inbox without replacing the existing CRM link', async () => {
    const thread = await prisma.emailThread.create({
      data: {
        organizationId: orgA,
        relatedEntityType: 'CONTACT',
        relatedEntityId: contactA,
        subject: 'Real customer request',
        lastMessageAt: new Date(),
        messages: {
          create: {
            organizationId: orgA,
            relatedEntityType: 'CONTACT',
            relatedEntityId: contactA,
            direction: 'INBOUND',
            fromName: 'Amina Customer',
            fromAddress: 'amina@example.test',
            toAddresses: ['support@example.test'],
            ccAddresses: [],
            subject: 'Real customer request',
            body: 'Please help with this request.',
            status: 'SENT',
            receivedAt: new Date(),
          },
        },
      },
    });
    const created = body<{ data: { id: string; sourceThreadId: string; contactId: string } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/mail/threads/${thread.id}/create-case`)
        .send({ title: 'Reviewed customer request', priority: 'HIGH' })
        .expect(201),
    ).data;
    expect(created).toMatchObject({ sourceThreadId: thread.id, contactId: contactA });
    const unchangedThread = await prisma.emailThread.findUniqueOrThrow({
      where: { id: thread.id },
    });
    expect(unchangedThread.relatedEntityType).toBe('CONTACT');
    expect(
      await prisma.conversationEvent.count({ where: { threadId: thread.id, type: 'CRM_LINKED' } }),
    ).toBe(1);
  });
});
