import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dayBounds } from '../src/activities/activities.service';
import { AutomationsService } from '../src/automations/automations.service';
import { PasswordService } from '../src/auth/password.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const origin = 'http://localhost:3000';
const password = 'Milestone-17-owner-password!';
const body = <T>(response: request.Response) => response.body as T;
const csrfFrom = (response: request.Response) => {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith('unicrm_csrf='));
  if (!cookie) throw new Error('CSRF cookie was not set');
  return decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
};
const mutate = (
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  method: 'delete' | 'patch' | 'post',
  path: string,
) => agent[method](path).set('origin', origin).set('x-csrf-token', csrf);

describe('Milestone 17 calendar and activity center', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;
  let organizationId: string;
  let otherOrganizationId: string;
  let ownerId: string;
  let otherOwnerId: string;
  let companyId: string;
  let leadId: string;
  let dealId: string;
  let agent: ReturnType<typeof request.agent>;
  let otherAgent: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;
  let staffAgent: ReturnType<typeof request.agent>;
  let csrf: string;
  let viewerCsrf: string;
  let staffCsrf: string;

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
      organizationName: 'Activities A',
      organizationSlug: `activities-a-${suffix}`,
      adminEmail: `activities-a-${suffix}@example.test`,
      adminPassword: password,
      adminFirstName: 'Owner',
      adminLastName: 'A',
    });
    await bootstrap.run({
      organizationName: 'Activities B',
      organizationSlug: `activities-b-${suffix}`,
      adminEmail: `activities-b-${suffix}@example.test`,
      adminPassword: password,
      adminFirstName: 'Owner',
      adminLastName: 'B',
    });
    const first = await prisma.organization.findUniqueOrThrow({
      where: { slug: `activities-a-${suffix}` },
      include: { users: true },
    });
    const second = await prisma.organization.findUniqueOrThrow({
      where: { slug: `activities-b-${suffix}` },
      include: { users: true },
    });
    organizationId = first.id;
    otherOrganizationId = second.id;
    ownerId = first.users[0]!.id;
    otherOwnerId = second.users[0]!.id;
    await prisma.organization.update({
      where: { id: organizationId },
      data: { timezone: 'America/New_York' },
    });
    const passwordHash = await app.get(PasswordService).hash(password);
    for (const roleName of ['Viewer', 'Staff'] as const) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { organizationId_name: { organizationId, name: roleName } },
      });
      const email = `activities-${roleName.toLowerCase()}-${suffix}@example.test`;
      await prisma.user.create({
        data: {
          organizationId,
          firstName: roleName,
          lastName: 'User',
          email,
          normalizedEmail: email,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          userRoles: { create: { roleId: role.id } },
        },
      });
    }
    agent = request.agent(server);
    otherAgent = request.agent(server);
    viewerAgent = request.agent(server);
    staffAgent = request.agent(server);
    csrf = csrfFrom(
      await agent
        .post('/api/v1/auth/login')
        .send({ email: `activities-a-${suffix}@example.test`, password })
        .expect(200),
    );
    await otherAgent
      .post('/api/v1/auth/login')
      .send({ email: `activities-b-${suffix}@example.test`, password })
      .expect(200);
    viewerCsrf = csrfFrom(
      await viewerAgent
        .post('/api/v1/auth/login')
        .send({ email: `activities-viewer-${suffix}@example.test`, password })
        .expect(200),
    );
    staffCsrf = csrfFrom(
      await staffAgent
        .post('/api/v1/auth/login')
        .send({ email: `activities-staff-${suffix}@example.test`, password })
        .expect(200),
    );
    companyId = body<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/companies').send({ name: 'ABC Ltd.' }).expect(201),
    ).data.id;
    leadId = body<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/leads')
        .send({ title: 'ABC Enterprise Website Inquiry', companyId, ownerId })
        .expect(201),
    ).data.id;
    dealId = body<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/deals')
        .send({ name: 'ABC Corporate Website', companyId, ownerId })
        .expect(201),
    ).data.id;
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationId, otherOrganizationId].filter(Boolean) } },
      });
    await app?.close();
  }, 30_000);

  it('creates Call and Meeting activities with tenant-scoped Lead and Deal relationships', async () => {
    const bounds = dayBounds(new Date(), 'America/New_York');
    const call = body<{ data: { id: string; startAt: string; relatedEntityId: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/activities')
        .send({
          type: 'CALL',
          subject: 'Lead discovery call',
          relatedEntityType: 'LEAD',
          relatedEntityId: leadId,
          ownerId,
          startAt: new Date(bounds.start.getTime() + 12 * 60 * 60_000).toISOString(),
          priority: 'HIGH',
        })
        .expect(201),
    ).data;
    expect(call.relatedEntityId).toBe(leadId);
    const meeting = body<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/activities')
        .send({
          type: 'MEETING',
          subject: 'ABC Proposal Review',
          relatedEntityType: 'DEAL',
          relatedEntityId: dealId,
          ownerId,
          startAt: new Date(Date.now() + 86_400_000).toISOString(),
          endAt: new Date(Date.now() + 90_000_000).toISOString(),
          reminderAt: new Date(Date.now() + 84_600_000).toISOString(),
        })
        .expect(201),
    ).data;
    expect(meeting.id).toBeTruthy();
    await mutate(agent, csrf, 'post', '/api/v1/activities')
      .send({
        type: 'CALL',
        subject: 'Cross tenant',
        relatedEntityType: 'LEAD',
        relatedEntityId: leadId,
        ownerId: otherOwnerId,
        startAt: new Date().toISOString(),
      })
      .expect(400);
  });

  it('supports Today, Upcoming, Overdue, calendar ranges, and organization timezone boundaries', async () => {
    const future = new Date(Date.now() + 3 * 86_400_000);
    await prisma.task.create({
      data: {
        organizationId,
        title: 'Unified calendar task',
        assigneeId: ownerId,
        reporterId: ownerId,
        createdById: ownerId,
        dueDate: future,
      },
    });
    await prisma.followUp.create({
      data: {
        organizationId,
        leadId,
        dueAt: future,
        type: 'CALL',
        assignedToId: ownerId,
        createdById: ownerId,
      },
    });
    const today = body<{ data: Array<{ subject: string }>; meta: { timezone: string } }>(
      await agent.get('/api/v1/activities?view=today&limit=100').expect(200),
    );
    expect(today.meta.timezone).toBe('America/New_York');
    expect(today.data.map(({ subject }) => subject)).toContain('Lead discovery call');
    const upcoming = body<{ data: Array<{ subject: string }> }>(
      await agent.get('/api/v1/activities?view=upcoming&limit=100').expect(200),
    );
    expect(upcoming.data.map(({ subject }) => subject)).toContain('ABC Proposal Review');
    expect(upcoming.data.map(({ subject }) => subject)).toContain('Unified calendar task');
    expect(
      upcoming.data.filter(({ subject }) => subject === 'ABC Enterprise Website Inquiry').length,
    ).toBeGreaterThanOrEqual(1);
    const range = body<{ data: Array<{ subject: string }> }>(
      await agent
        .get(
          `/api/v1/activities?view=all&limit=100&dateFrom=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&dateTo=${encodeURIComponent(new Date(Date.now() + 172_800_000).toISOString())}`,
        )
        .expect(200),
    );
    expect(range.data.length).toBeGreaterThanOrEqual(2);
  });

  it('reschedules, completes, cancels, assigns, and writes related-record history', async () => {
    const activity = await prisma.scheduledActivity.findFirstOrThrow({
      where: { organizationId, subject: 'ABC Proposal Review' },
    });
    const rescheduled = new Date(activity.startAt.getTime() + 3_600_000);
    await mutate(agent, csrf, 'patch', `/api/v1/activities/${activity.id}`)
      .send({ startAt: rescheduled.toISOString(), endAt: null, reminderAt: null })
      .expect(200);
    await mutate(agent, csrf, 'post', `/api/v1/activities/${activity.id}/complete`)
      .send({})
      .expect(201);
    expect(
      (await prisma.scheduledActivity.findUniqueOrThrow({ where: { id: activity.id } })).status,
    ).toBe('COMPLETED');
    expect(
      await prisma.activityLog.count({
        where: {
          organizationId,
          entityType: 'DEAL',
          entityId: dealId,
          action: 'ACTIVITY_COMPLETED',
        },
      }),
    ).toBe(1);
    const cancelled = body<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/activities')
        .send({
          type: 'OTHER',
          subject: 'Cancellation test',
          relatedEntityType: 'DEAL',
          relatedEntityId: dealId,
          startAt: new Date(Date.now() + 172_800_000).toISOString(),
        })
        .expect(201),
    ).data;
    await mutate(agent, csrf, 'post', `/api/v1/activities/${cancelled.id}/cancel`)
      .send({})
      .expect(201);
  });

  it('creates one idempotent reminder notification through the scheduled sweep', async () => {
    const activity = await prisma.scheduledActivity.create({
      data: {
        organizationId,
        type: 'FOLLOW_UP',
        subject: 'Reminder test',
        relatedEntityType: 'LEAD',
        relatedEntityId: leadId,
        ownerId,
        startAt: new Date(Date.now() + 60_000),
        reminderAt: new Date(Date.now() - 60_000),
        createdById: ownerId,
      },
    });
    const notifications = app.get(NotificationsService);
    await notifications.generateScheduled();
    await notifications.generateScheduled();
    expect(
      await prisma.notification.count({
        where: {
          organizationId,
          userId: ownerId,
          type: 'ACTIVITY_REMINDER',
          entityId: activity.id,
        },
      }),
    ).toBe(1);
  });

  it('shows overdue follow-ups and enforces Staff/Viewer RBAC plus tenant isolation', async () => {
    await prisma.scheduledActivity.create({
      data: {
        organizationId,
        type: 'FOLLOW_UP',
        subject: 'Overdue follow-up',
        relatedEntityType: 'LEAD',
        relatedEntityId: leadId,
        ownerId,
        startAt: new Date(Date.now() - 3_600_000),
        createdById: ownerId,
      },
    });
    const overdue = body<{ data: Array<{ subject: string }> }>(
      await agent.get('/api/v1/activities?view=overdue&type=FOLLOW_UP&limit=100').expect(200),
    );
    expect(overdue.data.map(({ subject }) => subject)).toContain('Overdue follow-up');
    await viewerAgent.get('/api/v1/activities?view=all').expect(200);
    await mutate(viewerAgent, viewerCsrf, 'post', '/api/v1/activities')
      .send({
        type: 'CALL',
        subject: 'Denied',
        relatedEntityType: 'LEAD',
        relatedEntityId: leadId,
        startAt: new Date().toISOString(),
      })
      .expect(403);
    await mutate(staffAgent, staffCsrf, 'post', '/api/v1/activities')
      .send({
        type: 'CALL',
        subject: 'Staff activity',
        relatedEntityType: 'LEAD',
        relatedEntityId: leadId,
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    await otherAgent
      .get(`/api/v1/activities?view=all&relatedEntityId=${leadId}`)
      .expect(200)
      .expect((response: request.Response) =>
        expect((response.body as { data: unknown[] }).data).toHaveLength(0),
      );
  });

  it('creates an idempotent scheduled activity through the existing automation engine', async () => {
    const rule = body<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/automations')
        .send({
          name: `Proposal follow-up ${crypto.randomUUID()}`,
          entityType: 'DEAL',
          triggerType: 'DEAL_STAGE_CHANGED',
          conditions: [],
          actions: [
            {
              type: 'CREATE_SCHEDULED_ACTIVITY',
              title: 'Proposal follow-up',
              activityType: 'FOLLOW_UP',
              dueInDays: 2,
              reminderMinutesBefore: 30,
              ownerId,
            },
          ],
          active: true,
        })
        .expect(201),
    ).data;
    const run = await prisma.automationRun.create({
      data: {
        organizationId,
        automationRuleId: rule.id,
        triggerEventId: `m17-${crypto.randomUUID()}`,
        entityType: 'DEAL',
        entityId: dealId,
        triggerPayload: { snapshot: { ownerId, status: null, tagIds: [], customFields: {} } },
      },
    });
    await app.get(AutomationsService).processRun(run.id);
    await app.get(AutomationsService).processRun(run.id);
    expect(await prisma.scheduledActivity.count({ where: { automationKey: `${run.id}:0` } })).toBe(
      1,
    );
  });
});
