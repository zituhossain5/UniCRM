import { HttpException, HttpStatus, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHmac, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RateLimitService } from '../src/auth/rate-limit.service';
import { AutomationsService } from '../src/automations/automations.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';
import { JobsService } from '../src/jobs/jobs.service';
import { WebToLeadService } from '../src/web-to-lead/web-to-lead.service';

const origin = 'http://localhost:3000';
const password = 'Web-to-Lead-owner-password!';

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
  method: 'patch' | 'post',
  path: string,
) {
  return agent[method](path).set('origin', origin).set('x-csrf-token', csrf);
}

class TestJobsService {
  integrationEvents: string[] = [];
  enqueueIntegrationEvent(id: string) {
    this.integrationEvents.push(id);
    return Promise.resolve();
  }
  enqueueWebhookDelivery() {
    return Promise.resolve();
  }
  enqueueAutomationRun() {
    return Promise.resolve();
  }
  enqueueEmail() {
    return Promise.resolve();
  }
}

describe('Web-to-Lead V1', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let processor: WebToLeadService;
  let automations: AutomationsService;
  let jobs: TestJobsService;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let csrfA = '';
  let csrfB = '';
  let orgA = '';
  let orgB = '';
  let pipelineA = '';
  let stageA = '';
  let pipelineB = '';
  let ownerA = '';
  let tagA = '';
  let fieldA = '';
  let integrationId = '';
  let secret = '';
  const rateConsume = vi.fn(() => Promise.resolve());
  const suffix = randomUUID();

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '100';
    process.env.CORS_ORIGINS = origin;
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 31).toString('base64');
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JobsService)
      .useClass(TestJobsService)
      .overrideProvider(RateLimitService)
      .useValue({ consume: rateConsume })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    processor = app.get(WebToLeadService);
    automations = app.get(AutomationsService);
    jobs = app.get<TestJobsService>(JobsService);

    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, name] of [
      [`wtl-a-${suffix}`, 'Web Lead A'],
      [`wtl-b-${suffix}`, 'Web Lead B'],
    ] as const)
      await bootstrap.run({
        organizationName: name,
        organizationSlug: slug,
        adminEmail: `${slug}@example.test`,
        adminPassword: password,
        adminFirstName: 'Owner',
        adminLastName: name.at(-1)!,
      });
    const a = await prisma.organization.findUniqueOrThrow({ where: { slug: `wtl-a-${suffix}` } });
    const b = await prisma.organization.findUniqueOrThrow({ where: { slug: `wtl-b-${suffix}` } });
    orgA = a.id;
    orgB = b.id;
    ownerA = (
      await prisma.user.findFirstOrThrow({ where: { organizationId: orgA, status: 'ACTIVE' } })
    ).id;
    const defaultA = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgA, entityType: 'LEAD', archivedAt: null },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    const defaultB = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgB, entityType: 'LEAD', archivedAt: null },
    });
    pipelineA = defaultA.id;
    stageA = defaultA.stages[0]!.id;
    pipelineB = defaultB.id;
    tagA = (
      await prisma.tag.create({
        data: { organizationId: orgA, name: 'Website', normalizedName: 'website' },
      })
    ).id;
    fieldA = (
      await prisma.customFieldDefinition.create({
        data: {
          organizationId: orgA,
          entityType: 'LEAD',
          name: 'Budget Type',
          key: 'budget_type',
          fieldType: 'SELECT',
          options: ['Fixed', 'Retainer'],
          position: 1,
        },
      })
    ).id;
    agentA = request.agent(server);
    agentB = request.agent(server);
    csrfA = csrfFrom(
      await agentA
        .post('/api/v1/auth/login')
        .send({ email: `wtl-a-${suffix}@example.test`, password })
        .expect(200),
    );
    csrfB = csrfFrom(
      await agentB
        .post('/api/v1/auth/login')
        .send({ email: `wtl-b-${suffix}@example.test`, password })
        .expect(200),
    );
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    await app?.close();
  }, 30_000);

  it('creates a tenant-scoped integration and reveals only its newly generated secret', async () => {
    const response = await mutate(agentA, csrfA, 'post', '/api/v1/integrations/web-to-lead')
      .send({
        name: 'Main website',
        sourceKey: 'main_website',
        defaultPipelineId: pipelineA,
        defaultStageId: stageA,
        defaultOwnerId: ownerA,
        defaultPriority: 'HIGH',
        defaultTagIds: [tagA],
        mappings: [{ sourceField: 'custom.budget', target: 'LEAD_CUSTOM_FIELD', targetId: fieldA }],
      })
      .expect(201);
    const created = body<{
      data: { id: string; secret: string; connection: Record<string, unknown> };
    }>(response).data;
    integrationId = created.id;
    secret = created.secret;
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(created.connection.encryptedSecret).toBeUndefined();
    const list = body<{ data: Array<Record<string, unknown>> }>(
      await agentA.get('/api/v1/integrations/web-to-lead').expect(200),
    ).data;
    expect(list[0]?.secret).toBeUndefined();
    expect(JSON.stringify(list)).not.toContain(secret);
    expect(
      body<{ data: unknown[] }>(await agentB.get('/api/v1/integrations/web-to-lead').expect(200))
        .data,
    ).toEqual([]);
  });

  it('rejects cross-tenant defaults and mapping references', async () => {
    await mutate(agentA, csrfA, 'post', '/api/v1/integrations/web-to-lead')
      .send({
        name: 'Invalid',
        sourceKey: 'invalid',
        defaultPipelineId: pipelineB,
        defaultStageId: stageA,
        defaultPriority: 'MEDIUM',
        mappings: [],
      })
      .expect(400);
    await mutate(agentB, csrfB, 'post', '/api/v1/integrations/web-to-lead')
      .send({
        name: 'Invalid mapping',
        sourceKey: 'invalid_mapping',
        defaultPipelineId: pipelineB,
        defaultStageId: stageA,
        defaultPriority: 'MEDIUM',
        mappings: [{ sourceField: 'email', target: 'LEAD_TAG', targetId: tagA }],
      })
      .expect(400);
  });

  it('enforces exact raw-body HMAC, timestamp tolerance, strict payloads, and contact requirements', async () => {
    const payload = { submissionId: `bad-${randomUUID()}`, email: 'signed@example.test' };
    const raw = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    await request(server)
      .post(`/api/v1/inbound/web-to-lead/${integrationId}`)
      .set('content-type', 'application/json')
      .set('x-unicrm-timestamp', timestamp)
      .set('x-unicrm-idempotency-key', payload.submissionId)
      .set('x-unicrm-signature', '0'.repeat(64))
      .send(raw)
      .expect(401);
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 1000).toString();
    const oldSignature = createHmac('sha256', secret)
      .update(`${oldTimestamp}.${raw}`)
      .digest('hex');
    await request(server)
      .post(`/api/v1/inbound/web-to-lead/${integrationId}`)
      .set('content-type', 'application/json')
      .set('x-unicrm-timestamp', oldTimestamp)
      .set('x-unicrm-idempotency-key', payload.submissionId)
      .set('x-unicrm-signature', oldSignature)
      .send(raw)
      .expect(401);
    const unknown = JSON.stringify({ ...payload, arbitrary: 'not allowed' });
    const unknownSignature = createHmac('sha256', secret)
      .update(`${timestamp}.${unknown}`)
      .digest('hex');
    await request(server)
      .post(`/api/v1/inbound/web-to-lead/${integrationId}`)
      .set('content-type', 'application/json')
      .set('x-unicrm-timestamp', timestamp)
      .set('x-unicrm-idempotency-key', payload.submissionId)
      .set('x-unicrm-signature', unknownSignature)
      .send(unknown)
      .expect(400);
    const noContact = JSON.stringify({ submissionId: `none-${randomUUID()}` });
    const noContactSignature = createHmac('sha256', secret)
      .update(`${timestamp}.${noContact}`)
      .digest('hex');
    await request(server)
      .post(`/api/v1/inbound/web-to-lead/${integrationId}`)
      .set('content-type', 'application/json')
      .set('x-unicrm-timestamp', timestamp)
      .set('x-unicrm-idempotency-key', `none-${randomUUID()}`)
      .set('x-unicrm-signature', noContactSignature)
      .send(noContact)
      .expect(400);
  });

  it('queues once, creates CRM records with mappings, emits lead.created, and suppresses duplicates', async () => {
    const submissionId = `accepted-${randomUUID()}`;
    const payload = {
      submissionId,
      fullName: 'Amina Rahman',
      email: 'AMINA@example.test',
      company: 'Example Limited',
      subject: 'Website redesign',
      custom: { budget: 'Fixed' },
    };
    const raw = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
    const send = (idempotency = submissionId) =>
      request(server)
        .post(`/api/v1/inbound/web-to-lead/${integrationId}`)
        .set('content-type', 'application/json')
        .set('x-unicrm-timestamp', timestamp)
        .set('x-unicrm-idempotency-key', idempotency)
        .set('x-unicrm-signature', signature)
        .send(raw);
    await send().expect(202);
    expect(jobs.integrationEvents).toHaveLength(1);
    const eventId = jobs.integrationEvents[0]!;
    const publish = vi.spyOn(automations, 'publishBusinessEvent');
    await processor.processEvent(eventId);
    expect(publish).toHaveBeenCalledWith(
      orgA,
      'lead.created',
      expect.any(String),
      expect.objectContaining({ source: 'WEBSITE' }),
      { triggerEventId: eventId },
    );
    const submission = await prisma.webToLeadSubmission.findUniqueOrThrow({ where: { eventId } });
    expect(submission.status).toBe('ACCEPTED');
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: submission.leadId! } });
    expect(lead.source).toBe('WEBSITE');
    expect(lead.priority).toBe('HIGH');
    expect(lead.ownerId).toBe(ownerA);
    expect(lead.normalizedEmail).toBe('amina@example.test');
    expect(
      await prisma.entityTag.count({
        where: { organizationId: orgA, entityId: lead.id, tagId: tagA },
      }),
    ).toBe(1);
    expect(
      await prisma.customFieldValue.findFirst({
        where: { organizationId: orgA, entityId: lead.id, fieldDefinitionId: fieldA },
      }),
    ).toMatchObject({ value: 'Fixed' });
    await send().expect(202);
    await send(`different-${randomUUID()}`).expect(202);
    expect(jobs.integrationEvents).toHaveLength(1);
    expect(
      await prisma.lead.count({
        where: { organizationId: orgA, normalizedEmail: 'amina@example.test' },
      }),
    ).toBe(1);
    expect(rateConsume).toHaveBeenCalled();
    expect(
      await prisma.activityLog.count({
        where: { organizationId: orgA, entityId: lead.id, action: 'WEB_TO_LEAD_CREATED' },
      }),
    ).toBe(1);
    expect(
      await prisma.integrationEvent.findUniqueOrThrow({ where: { id: eventId } }),
    ).toMatchObject({ status: 'PROCESSED', eventType: 'web_to_lead.submitted' });
    publish.mockRestore();
  });

  it('reuses Contact and Company but creates a new Lead for a genuinely new submission', async () => {
    const submissionId = `return-${randomUUID()}`;
    const payload = {
      submissionId,
      fullName: 'Amina Rahman',
      email: 'amina@example.test',
      company: 'example limited',
      subject: 'Second inquiry',
      custom: { budget: 'Retainer' },
    };
    const raw = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
    await request(server)
      .post(`/api/v1/inbound/web-to-lead/${integrationId}`)
      .set('content-type', 'application/json')
      .set('x-unicrm-timestamp', timestamp)
      .set('x-unicrm-idempotency-key', submissionId)
      .set('x-unicrm-signature', signature)
      .send(raw)
      .expect(202);
    const eventId = jobs.integrationEvents.at(-1)!;
    await processor.processEvent(eventId);
    expect(
      await prisma.contact.count({
        where: { organizationId: orgA, normalizedEmail: 'amina@example.test' },
      }),
    ).toBe(1);
    expect(
      await prisma.company.count({
        where: { organizationId: orgA, name: { equals: 'Example Limited', mode: 'insensitive' } },
      }),
    ).toBe(1);
    expect(
      await prisma.lead.count({
        where: { organizationId: orgA, normalizedEmail: 'amina@example.test' },
      }),
    ).toBe(2);
  });

  it('enforces the existing Redis-backed rate-limit boundary', async () => {
    rateConsume.mockRejectedValueOnce(
      new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS),
    );
    await request(server)
      .post(`/api/v1/inbound/web-to-lead/${integrationId}`)
      .set('content-type', 'application/json')
      .send({ submissionId: randomUUID(), email: 'limited@example.test' })
      .expect(429);
  });

  it('stops accepting submissions while disabled and rotates secrets without exposing stored material', async () => {
    await mutate(agentA, csrfA, 'patch', `/api/v1/integrations/web-to-lead/${integrationId}`)
      .send({ active: false })
      .expect(200);
    const payload = { submissionId: randomUUID(), email: 'disabled@example.test' };
    const raw = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
    await request(server)
      .post(`/api/v1/inbound/web-to-lead/${integrationId}`)
      .set('content-type', 'application/json')
      .set('x-unicrm-timestamp', timestamp)
      .set('x-unicrm-idempotency-key', payload.submissionId)
      .set('x-unicrm-signature', signature)
      .send(raw)
      .expect(404);
    const rotated = body<{ data: { secret: string } }>(
      await mutate(
        agentA,
        csrfA,
        'post',
        `/api/v1/integrations/web-to-lead/${integrationId}/rotate-secret`,
      )
        .send({})
        .expect(201),
    ).data.secret;
    expect(rotated).not.toBe(secret);
    expect(
      JSON.stringify(
        body(await agentA.get(`/api/v1/integrations/web-to-lead/${integrationId}`).expect(200)),
      ),
    ).not.toContain(rotated);
  });
});
