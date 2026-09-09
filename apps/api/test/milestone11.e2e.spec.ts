import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AutomationsService } from '../src/automations/automations.service';
import { PasswordService } from '../src/auth/password.service';
import { RateLimitService } from '../src/auth/rate-limit.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';
import { JobsService } from '../src/jobs/jobs.service';

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
  automationRuns: string[] = [];
  deliveries: string[] = [];
  enqueueAutomationRun(id: string) {
    this.automationRuns.push(id);
    return Promise.resolve();
  }
  enqueueWebhookDelivery(id: string) {
    this.deliveries.push(id);
    return Promise.resolve();
  }
  enqueueIntegrationEvent() {
    return Promise.resolve();
  }
  enqueueEmail() {
    return Promise.resolve();
  }
}

describe('Milestone 11 CRM automation V1', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let automations: AutomationsService;
  let jobs: TestJobsService;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;
  let csrfA: string;
  let orgA: string;
  let ownerA: string;
  let ownerB: string;
  let leadId: string;
  let projectId: string;
  let tagId: string;
  let qualifiedStageId: string;
  let slugA: string;
  let slugB: string;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '100';
    process.env.CORS_ORIGINS = origin;
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 29).toString('base64');
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
    automations = app.get(AutomationsService);
    jobs = app.get<TestJobsService>(JobsService);
    slugA = `m11-a-${crypto.randomUUID()}`;
    slugB = `m11-b-${crypto.randomUUID()}`;
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, suffix] of [
      [slugA, 'A'],
      [slugB, 'B'],
    ] as const)
      await bootstrap.run({
        organizationName: `Milestone 11 ${suffix}`,
        organizationSlug: slug,
        adminEmail: `${slug}@example.test`,
        adminPassword: password,
        adminFirstName: 'Owner',
        adminLastName: suffix,
      });
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: slugA },
      include: { users: true, pipelines: { include: { stages: true } } },
    });
    const organizationB = await prisma.organization.findUniqueOrThrow({
      where: { slug: slugB },
      include: { users: true },
    });
    orgA = organization.id;
    ownerA = organization.users[0]!.id;
    ownerB = organizationB.users[0]!.id;
    const pipeline = organization.pipelines[0]!;
    qualifiedStageId =
      pipeline.stages.find(({ name }) => name === 'Qualified')?.id ?? pipeline.stages[1]!.id;
    const company = await prisma.company.create({
      data: { organizationId: orgA, name: 'Automation Co', createdById: ownerA },
    });
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgA,
        title: 'High Value Lead',
        pipelineId: pipeline.id,
        stageId: qualifiedStageId,
        ownerId: ownerA,
        priority: 'HIGH',
        estimatedValue: 250000,
        createdById: ownerA,
      },
    });
    leadId = lead.id;
    projectId = (
      await prisma.project.create({
        data: {
          organizationId: orgA,
          companyId: company.id,
          name: 'Automation Project',
          projectManagerId: ownerA,
          createdById: ownerA,
        },
      })
    ).id;
    tagId = (
      await prisma.tag.create({
        data: { organizationId: orgA, name: 'High Value', normalizedName: 'high value' },
      })
    ).id;
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

    const viewerRole = await prisma.role.findFirstOrThrow({
      where: { organizationId: orgA, name: 'Viewer' },
    });
    const passwordHash = await app.get(PasswordService).hash(password);
    await prisma.user.create({
      data: {
        organizationId: orgA,
        firstName: 'View',
        lastName: 'Only',
        email: `viewer-${slugA}@example.test`,
        normalizedEmail: `viewer-${slugA}@example.test`,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: { roleId: viewerRole.id } },
      },
    });
    viewerAgent = request.agent(server);
    await viewerAgent
      .post('/api/v1/auth/login')
      .send({ email: `viewer-${slugA}@example.test`, password })
      .expect(200);
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({
        where: { slug: { in: [slugA, slugB].filter(Boolean) } },
      });
    await app?.close();
  }, 30_000);

  it('runs the acceptance automation once when stage and priority conditions pass', async () => {
    const rule = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/automations')
        .send({
          name: 'High Value Qualified Lead',
          entityType: 'LEAD',
          triggerType: 'LEAD_STAGE_CHANGED',
          triggerConfig: { to: qualifiedStageId },
          conditions: [{ field: 'priority', operator: 'EQUALS', value: 'HIGH' }],
          actions: [
            { type: 'ADD_TAG', tagId },
            { type: 'CREATE_FOLLOW_UP', dueInDays: 2, followUpType: 'CALL' },
            { type: 'CREATE_NOTIFICATION' },
          ],
        })
        .expect(201),
    ).data;
    const eventId = `stage-${crypto.randomUUID()}`;
    await automations.publishBusinessEvent(
      orgA,
      'lead.stage_changed',
      leadId,
      { fromStageId: crypto.randomUUID(), toStageId: qualifiedStageId },
      { triggerEventId: eventId },
    );
    const run = await prisma.automationRun.findFirstOrThrow({
      where: { automationRuleId: rule.id },
    });
    expect(jobs.automationRuns).toContain(run.id);
    await automations.processRun(run.id);
    await expect(
      prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED', attemptCount: 1 });
    const persistedRun = await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(persistedRun.actionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, type: 'ADD_TAG', status: 'SUCCEEDED' }),
        expect.objectContaining({ index: 1, type: 'CREATE_FOLLOW_UP', status: 'SUCCEEDED' }),
        expect.objectContaining({ index: 2, type: 'CREATE_NOTIFICATION', status: 'SUCCEEDED' }),
      ]),
    );
    expect(await prisma.entityTag.count({ where: { tagId, entityId: leadId } })).toBe(1);
    expect(await prisma.followUp.count({ where: { leadId } })).toBe(1);
    const notification = await prisma.notification.findFirstOrThrow({
      where: { entityId: leadId, type: 'AUTOMATION' },
    });
    expect(notification).toMatchObject({
      organizationId: orgA,
      userId: ownerA,
      title: 'High Value Qualified Lead',
      readAt: null,
    });
    expect(
      body<{ data: { count: number } }>(
        await agentA.get('/api/v1/notifications/unread-count').expect(200),
      ).data.count,
    ).toBeGreaterThan(0);
    expect(
      body<{ data: Array<{ id: string; title: string }> }>(
        await agentA.get('/api/v1/notifications?unread=true').expect(200),
      ).data,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: notification.id })]));
    const history = body<{
      data: Array<{
        id: string;
        entityLabel: string;
        triggerSummary: string;
        actionSummary: string;
        actionResults: Array<{ status: string }>;
      }>;
    }>(await agentA.get(`/api/v1/automations/${rule.id}/runs`).expect(200)).data;
    expect(history[0]).toMatchObject({
      id: run.id,
      entityLabel: 'High Value Lead',
      actionSummary: '3 actions completed',
    });
    expect(history[0]!.triggerSummary).toContain('Qualified');
    expect(history[0]!.actionResults).toHaveLength(3);
    await automations.publishBusinessEvent(
      orgA,
      'lead.stage_changed',
      leadId,
      { fromStageId: crypto.randomUUID(), toStageId: qualifiedStageId },
      { triggerEventId: eventId },
    );
    expect(await prisma.automationRun.count({ where: { automationRuleId: rule.id } })).toBe(1);
  });

  it('fails notification actions when entity-owner recipients cannot be resolved', async () => {
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgA },
      include: { stages: true },
    });
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgA,
        title: 'Automation Notification Missing Owner',
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        ownerId: null,
        priority: 'HIGH',
        createdById: ownerA,
      },
    });
    const rule = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/automations')
        .send({
          name: 'Missing owner notification',
          entityType: 'LEAD',
          triggerType: 'LEAD_CREATED',
          conditions: [],
          actions: [{ type: 'CREATE_NOTIFICATION', title: 'Automation notification' }],
        })
        .expect(201),
    ).data;
    await automations.publishBusinessEvent(orgA, 'lead.created', lead.id, { title: lead.title });
    const run = await prisma.automationRun.findFirstOrThrow({
      where: { automationRuleId: rule.id, entityId: lead.id },
    });
    await automations.processRun(run.id);
    const failed = await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(failed).toMatchObject({
      status: 'FAILED',
      retryable: false,
      errorSummary: 'Automation entity has no notification recipient',
    });
    expect(failed.actionResults).toEqual([
      expect.objectContaining({
        type: 'CREATE_NOTIFICATION',
        status: 'FAILED',
        summary: 'Automation entity has no notification recipient',
      }),
    ]);
    expect(
      await prisma.notification.count({ where: { entityId: lead.id, type: 'AUTOMATION' } }),
    ).toBe(0);
  });

  it('records condition failure, ignores disabled rules, and evaluates custom fields', async () => {
    const failed = await prisma.automationRule.create({
      data: {
        organizationId: orgA,
        createdById: ownerA,
        name: 'Condition fail',
        entityType: 'LEAD',
        triggerType: 'LEAD_CREATED',
        conditions: [{ field: 'priority', operator: 'EQUALS', value: 'LOW' }],
        actions: [{ type: 'CREATE_NOTIFICATION' }],
      },
    });
    await automations.publishBusinessEvent(orgA, 'lead.created', leadId, {
      title: 'High Value Lead',
    });
    const failedRun = await prisma.automationRun.findFirstOrThrow({
      where: { automationRuleId: failed.id },
    });
    await automations.processRun(failedRun.id);
    expect(
      (await prisma.automationRun.findUniqueOrThrow({ where: { id: failedRun.id } })).status,
    ).toBe('SKIPPED');
    const disabled = await prisma.automationRule.create({
      data: {
        organizationId: orgA,
        createdById: ownerA,
        name: 'Disabled',
        entityType: 'LEAD',
        triggerType: 'LEAD_CREATED',
        active: false,
        conditions: [],
        actions: [{ type: 'CREATE_NOTIFICATION' }],
      },
    });
    await automations.publishBusinessEvent(orgA, 'lead.created', leadId, {
      title: 'No disabled run',
    });
    expect(await prisma.automationRun.count({ where: { automationRuleId: disabled.id } })).toBe(0);

    const definition = await prisma.customFieldDefinition.create({
      data: {
        organizationId: orgA,
        entityType: 'LEAD',
        name: 'Budget Type',
        key: 'budget_type',
        fieldType: 'SELECT',
        required: false,
        position: 50,
        options: ['Fixed', 'Variable'],
      },
    });
    await prisma.customFieldValue.create({
      data: {
        organizationId: orgA,
        entityType: 'LEAD',
        entityId: leadId,
        fieldDefinitionId: definition.id,
        value: 'Fixed',
      },
    });
    const customRule = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/automations')
        .send({
          name: 'Fixed budget',
          entityType: 'LEAD',
          triggerType: 'LEAD_CREATED',
          conditions: [
            {
              field: 'customField',
              fieldDefinitionId: definition.id,
              operator: 'EQUALS',
              value: 'Fixed',
            },
          ],
          actions: [{ type: 'CREATE_NOTIFICATION', title: 'Fixed budget' }],
        })
        .expect(201),
    ).data;
    await automations.publishBusinessEvent(orgA, 'lead.created', leadId, {
      title: 'Custom field trigger',
    });
    const customRun = await prisma.automationRun.findFirstOrThrow({
      where: { automationRuleId: customRule.id },
    });
    await automations.processRun(customRun.id);
    expect(
      (await prisma.automationRun.findUniqueOrThrow({ where: { id: customRun.id } })).status,
    ).toBe('SUCCEEDED');
  });

  it('creates tasks and prevents unbounded recursive automation chains', async () => {
    await prisma.automationRule.create({
      data: {
        organizationId: orgA,
        createdById: ownerA,
        name: 'Recursive task',
        entityType: 'TASK',
        triggerType: 'TASK_CREATED',
        conditions: [],
        actions: [{ type: 'CREATE_TASK', title: 'Bounded child', dueInDays: 1 }],
      },
    });
    const root = await prisma.task.create({
      data: {
        organizationId: orgA,
        projectId,
        title: 'Root task',
        reporterId: ownerA,
        createdById: ownerA,
      },
    });
    await automations.publishBusinessEvent(orgA, 'task.created', root.id, {
      title: root.title,
      projectId,
    });
    for (let depth = 0; depth < 8; depth += 1) {
      const pending = await prisma.automationRun.findFirst({
        where: { organizationId: orgA, status: 'PENDING', entityType: 'TASK' },
        orderBy: { createdAt: 'asc' },
      });
      if (!pending) break;
      await automations.processRun(pending.id);
    }
    const runs = await prisma.automationRun.findMany({
      where: { organizationId: orgA, entityType: 'TASK' },
    });
    expect(runs.length).toBeLessThanOrEqual(5);
    expect(
      await prisma.task.count({ where: { organizationId: orgA, title: 'Bounded child' } }),
    ).toBeGreaterThan(0);
  });

  it('queues configured outbound webhook actions and safely recovers pending runs', async () => {
    const connection = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/integrations/connections')
        .send({
          name: 'Automation outbound',
          provider: 'CUSTOM',
          direction: 'OUTBOUND',
          secret: 'automation-webhook-secret-32-characters',
        })
        .expect(201),
    ).data;
    const subscription = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/integrations/subscriptions')
        .send({
          connectionId: connection.id,
          name: 'Automation target',
          targetUrl: 'https://example.com/webhook',
          secret: 'automation-subscription-secret-32-chars',
          eventTypes: ['lead.created'],
        })
        .expect(201),
    ).data;
    const rule = await prisma.automationRule.create({
      data: {
        organizationId: orgA,
        createdById: ownerA,
        name: 'Project webhook',
        entityType: 'PROJECT',
        triggerType: 'PROJECT_CREATED',
        conditions: [],
        actions: [{ type: 'TRIGGER_WEBHOOK', webhookSubscriptionId: subscription.id }],
      },
    });
    await automations.publishBusinessEvent(orgA, 'project.created', projectId, {
      name: 'Automation Project',
    });
    const run = await prisma.automationRun.findFirstOrThrow({
      where: { automationRuleId: rule.id },
    });
    await automations.processRun(run.id);
    expect(
      await prisma.webhookDelivery.count({
        where: { subscriptionId: subscription.id, eventType: 'project.created' },
      }),
    ).toBe(1);
    expect(jobs.deliveries.length).toBeGreaterThan(0);
    const pending = await prisma.automationRun.create({
      data: {
        organizationId: orgA,
        automationRuleId: rule.id,
        triggerEventId: `recovery-${crypto.randomUUID()}`,
        entityType: 'PROJECT',
        entityId: projectId,
        triggerPayload: { eventType: 'project.created', snapshot: { id: projectId } },
      },
    });
    jobs.automationRuns = [];
    await automations.recoverPendingRuns();
    expect(jobs.automationRuns).toContain(pending.id);
  });

  it('marks business errors non-retryable and bounds manual retries', async () => {
    const rule = await prisma.automationRule.create({
      data: {
        organizationId: orgA,
        createdById: ownerA,
        name: 'Invalid task target',
        entityType: 'PAYMENT',
        triggerType: 'PAYMENT_CREATED',
        conditions: [],
        actions: [{ type: 'CREATE_TASK' }],
      },
    });
    const payment = await prisma.payment.create({
      data: {
        organizationId: orgA,
        companyId: (await prisma.company.findFirstOrThrow({ where: { organizationId: orgA } })).id,
        amount: 1,
        currency: 'BDT',
        paymentDate: new Date(),
        method: 'CASH',
        recordedById: ownerA,
      },
    });
    await automations.publishBusinessEvent(orgA, 'payment.created', payment.id, { amount: 1 });
    const run = await prisma.automationRun.findFirstOrThrow({
      where: { automationRuleId: rule.id },
    });
    await automations.processRun(run.id);
    await expect(
      prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).resolves.toMatchObject({ status: 'FAILED', retryable: false, attemptCount: 1 });
    await mutate(agentA, csrfA, 'post', `/api/v1/automations/runs/${run.id}/retry`).expect(409);
  });

  it('enforces tenant isolation and denies Viewer management', async () => {
    expect(
      body<{ data: unknown[] }>(await agentB.get('/api/v1/automations').expect(200)).data,
    ).toHaveLength(0);
    await mutate(agentA, csrfA, 'post', '/api/v1/automations')
      .send({
        name: 'Cross tenant notification recipient',
        entityType: 'LEAD',
        triggerType: 'LEAD_CREATED',
        conditions: [],
        actions: [{ type: 'CREATE_NOTIFICATION', ownerId: ownerB }],
      })
      .expect(400);
    await viewerAgent.get('/api/v1/automations').expect(403);
    await viewerAgent.post('/api/v1/automations').set('origin', origin).send({}).expect(403);
  });
});
