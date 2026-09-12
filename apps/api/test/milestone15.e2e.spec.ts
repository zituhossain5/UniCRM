import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RateLimitService } from '../src/auth/rate-limit.service';
import { PasswordService } from '../src/auth/password.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';
import { JobsService } from '../src/jobs/jobs.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const origin = 'http://localhost:3000';
const password = 'CRM-owner-password-2026!';

function body<T>(response: request.Response): T {
  return response.body as T;
}

function csrfFrom(response: request.Response) {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith('unicrm_csrf='));
  if (!cookie) throw new Error('CSRF cookie was not set');
  return decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
}

function mutate(
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  method: 'patch' | 'post',
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

describe('Milestone 15 shared inbox', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let orgA: string;
  let ownerA: string;
  let ownerB: string;
  let staffA: string;
  let viewerEmail: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let csrfA: string;
  let slugA: string;
  let slugB: string;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '100';
    process.env.CORS_ORIGINS = origin;
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 45).toString('base64');
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
    slugA = `m15-a-${crypto.randomUUID()}`;
    slugB = `m15-b-${crypto.randomUUID()}`;
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, suffix] of [
      [slugA, 'A'],
      [slugB, 'B'],
    ] as const)
      await bootstrap.run({
        organizationName: `Milestone 15 ${suffix}`,
        organizationSlug: slug,
        adminEmail: `${slug}@example.test`,
        adminPassword: password,
        adminFirstName: 'Owner',
        adminLastName: suffix,
      });
    const organizationA = await prisma.organization.findUniqueOrThrow({
      where: { slug: slugA },
      include: { users: true },
    });
    const organizationB = await prisma.organization.findUniqueOrThrow({
      where: { slug: slugB },
      include: { users: true },
    });
    orgA = organizationA.id;
    ownerA = organizationA.users[0]!.id;
    ownerB = organizationB.users[0]!.id;
    staffA = (await createUser('Staff')).id;
    viewerEmail = (await createUser('Viewer')).email;
    agentA = request.agent(server);
    agentB = request.agent(server);
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
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({
        where: { slug: { in: [slugA, slugB].filter(Boolean) } },
      });
    await app?.close();
  }, 30_000);

  it('assigns, filters Mine/Unassigned, unassigns, and rejects cross-tenant assignees', async () => {
    const thread = await createThread('Assignment workflow');
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/assignment`)
      .send({ assignedUserId: ownerA })
      .expect(200);
    expect(
      body<{ data: Array<{ id: string }> }>(
        await agentA.get('/api/v1/mail/conversations?view=MINE').expect(200),
      ).data.map(({ id }) => id),
    ).toContain(thread.id);
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/assignment`)
      .send({ assignedUserId: null })
      .expect(200);
    expect(
      body<{ data: Array<{ id: string }> }>(
        await agentA.get('/api/v1/mail/conversations?view=UNASSIGNED').expect(200),
      ).data.map(({ id }) => id),
    ).toContain(thread.id);
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/assignment`)
      .send({ assignedUserId: ownerB })
      .expect(400);
  });

  it('updates status, priority, unread, due time, and records resolve/reopen history', async () => {
    const thread = await createThread('Conversation state');
    const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/priority`)
      .send({ priority: 'HIGH' })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/status`)
      .send({ status: 'RESOLVED', dueAt })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/status`)
      .send({ status: 'OPEN' })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/read`)
      .send({ unread: false })
      .expect(200);
    const saved = await prisma.emailThread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(saved).toMatchObject({ inboxPriority: 'HIGH', inboxStatus: 'OPEN', isUnread: false });
    expect(saved.resolvedAt).toBeNull();
    expect(
      await prisma.conversationEvent.findMany({
        where: { threadId: thread.id },
        select: { type: true },
      }),
    ).toEqual(
      expect.arrayContaining([
        { type: 'PRIORITY_CHANGED' },
        { type: 'RESOLVED' },
        { type: 'REOPENED' },
        { type: 'DUE_AT_CHANGED' },
      ]),
    );
  });

  it('stores internal notes without creating outgoing email', async () => {
    const thread = await createThread('Internal note isolation');
    const before = await prisma.emailMessage.count({ where: { threadId: thread.id } });
    await mutate(agentA, csrfA, 'post', `/api/v1/mail/threads/${thread.id}/notes`)
      .send({ content: 'Team-only context. Never send this to the customer.' })
      .expect(201);
    expect(await prisma.emailMessage.count({ where: { threadId: thread.id } })).toBe(before);
    expect(await prisma.conversationNote.count({ where: { threadId: thread.id } })).toBe(1);
  });

  it('creates and links a reviewed Lead and creates a project-optional Task through existing services', async () => {
    const thread = await createThread('New opportunity from email');
    const lead = body<{ data: { id: string; source: string; email: string } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/mail/threads/${thread.id}/create-lead`)
        .send({ title: 'Reviewed inbox opportunity', firstName: 'Customer' })
        .expect(201),
    ).data;
    expect(lead).toMatchObject({ source: 'EMAIL', email: 'customer@example.test' });
    expect(await prisma.emailThread.findUniqueOrThrow({ where: { id: thread.id } })).toMatchObject({
      relatedEntityType: 'LEAD',
      relatedEntityId: lead.id,
    });
    const task = body<{ data: { id: string; projectId: string | null } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/mail/threads/${thread.id}/create-task`)
        .send({ title: 'Follow up on inbox opportunity', dueDate: '2026-09-20' })
        .expect(201),
    ).data;
    expect(task.projectId).toBeNull();
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeTruthy();
  });

  it('creates idempotent assignment and due notifications through the scheduled sweep', async () => {
    const thread = await createThread('Notification workflow');
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/assignment`)
      .send({ assignedUserId: staffA })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/priority`)
      .send({ priority: 'URGENT' })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/mail/threads/${thread.id}/status`)
      .send({ dueAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(200);
    const assignmentCount = await prisma.notification.count({
      where: { entityId: thread.id, userId: staffA, type: 'INBOX_ASSIGNED' },
    });
    expect(assignmentCount).toBeGreaterThanOrEqual(1);
    await notifications.generateScheduled();
    await notifications.generateScheduled();
    expect(
      await prisma.notification.count({
        where: { entityId: thread.id, userId: staffA, type: 'INBOX_DUE' },
      }),
    ).toBe(1);
  });

  it('keeps Viewer mutations read-only and hides threads across tenants', async () => {
    const thread = await createThread('Permission boundary');
    const viewer = await login(viewerEmail);
    await viewer.agent.get('/api/v1/mail/conversations').expect(200);
    await mutate(viewer.agent, viewer.csrf, 'patch', `/api/v1/mail/threads/${thread.id}/assignment`)
      .send({ assignedUserId: ownerA })
      .expect(403);
    await mutate(viewer.agent, viewer.csrf, 'post', `/api/v1/mail/threads/${thread.id}/notes`)
      .send({ content: 'Not allowed' })
      .expect(403);
    await agentB.get(`/api/v1/mail/threads/${thread.id}`).expect(404);
  });

  async function createThread(subject: string) {
    return prisma.emailThread.create({
      data: {
        organizationId: orgA,
        subject,
        lastMessageAt: new Date(),
        messages: {
          create: {
            organizationId: orgA,
            direction: 'INBOUND',
            fromName: 'Customer Person',
            fromAddress: 'customer@example.test',
            toAddresses: ['shared@example.test'],
            ccAddresses: [],
            subject,
            body: 'A customer message for Milestone 15 verification.',
            status: 'SENT',
            receivedAt: new Date(),
          },
        },
      },
    });
  }

  async function createUser(roleName: 'Staff' | 'Viewer') {
    const role = await prisma.role.findFirstOrThrow({
      where: { organizationId: orgA, name: roleName },
    });
    const email = `${roleName.toLowerCase()}-${crypto.randomUUID()}@example.test`;
    return prisma.user.create({
      data: {
        organizationId: orgA,
        firstName: roleName,
        lastName: 'User',
        email,
        normalizedEmail: email,
        passwordHash: await app.get(PasswordService).hash(password),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: { roleId: role.id } },
      },
    });
  }

  async function login(email: string) {
    const agent = request.agent(server);
    const response = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
    return { agent, csrf: csrfFrom(response) };
  }
});
