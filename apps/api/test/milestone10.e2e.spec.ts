import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service';
import { RateLimitService } from '../src/auth/rate-limit.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { JobsService } from '../src/jobs/jobs.service';

const origin = 'http://localhost:3000';
const password = 'CRM-owner-password-2026!';
const secret = 'integration-test-secret-with-32-characters';

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
  integrationEvents: string[] = [];
  deliveries: string[] = [];
  enqueueIntegrationEvent(id: string) {
    this.integrationEvents.push(id);
    return Promise.resolve();
  }
  enqueueWebhookDelivery(id: string) {
    this.deliveries.push(id);
    return Promise.resolve();
  }
  enqueueEmail() {
    return Promise.resolve();
  }
}

describe('Milestone 10 generic integration platform', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let integrations: IntegrationsService;
  let jobs: TestJobsService;
  let slugA: string;
  let slugB: string;
  let orgA: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let csrfA: string;
  let csrfB: string;
  let connectionId: string;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '100';
    process.env.CORS_ORIGINS = origin;
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JobsService)
      .useClass(TestJobsService)
      .overrideProvider(RateLimitService)
      .useValue({ consume: () => Promise.resolve() })
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
    integrations = app.get(IntegrationsService);
    jobs = app.get<TestJobsService>(JobsService);
    slugA = `m10-a-${crypto.randomUUID()}`;
    slugB = `m10-b-${crypto.randomUUID()}`;
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, suffix] of [
      [slugA, 'A'],
      [slugB, 'B'],
    ] as const)
      await bootstrap.run({
        organizationName: `Milestone 10 ${suffix}`,
        organizationSlug: slug,
        adminEmail: `${slug}@example.test`,
        adminPassword: password,
        adminFirstName: 'Owner',
        adminLastName: suffix,
      });
    const organizationA = await prisma.organization.findUniqueOrThrow({ where: { slug: slugA } });
    orgA = organizationA.id;
    agentA = request.agent(server);
    agentB = request.agent(server);
    csrfA = csrfFrom(
      await agentA
        .post('/api/v1/auth/login')
        .send({ email: `${slugA}@example.test`, password })
        .expect(200),
    );
    csrfB = csrfFrom(
      await agentB
        .post('/api/v1/auth/login')
        .send({ email: `${slugB}@example.test`, password })
        .expect(200),
    );
    const created = body<{ data: { id: string; encryptedSecret?: string; secret?: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/integrations/connections')
        .send({ name: 'Demo External System', provider: 'CUSTOM', direction: 'BOTH', secret })
        .expect(201),
    ).data;
    expect(created.encryptedSecret).toBeUndefined();
    expect(created.secret).toBeUndefined();
    connectionId = created.id;
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({
        where: { slug: { in: [slugA, slugB].filter(Boolean) } },
      });
    await app?.close();
  }, 30_000);

  it('authenticates raw inbound payloads, rejects replay windows, and processes each event once', async () => {
    const payload = {
      eventId: `evt-${crypto.randomUUID()}`,
      eventType: 'customer.created',
      occurredAt: new Date().toISOString(),
      data: { name: 'Safe', password: 'must-redact' },
    };
    const raw = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    const send = () =>
      request(server)
        .post(`/api/v1/integrations/webhooks/${connectionId}`)
        .set('content-type', 'application/json')
        .set('x-unicrm-event', payload.eventType)
        .set('x-unicrm-delivery', payload.eventId)
        .set('x-unicrm-timestamp', timestamp)
        .set('x-unicrm-signature', signature)
        .send(raw);
    const accepted = body<{ data: { duplicate: boolean; eventId: string } }>(
      await send().expect(202),
    ).data;
    expect(accepted.duplicate).toBe(false);
    expect(jobs.integrationEvents).toContain(accepted.eventId);
    expect(body<{ data: { duplicate: boolean } }>(await send().expect(202)).data.duplicate).toBe(
      true,
    );
    await integrations.processInboundEvent(accepted.eventId);
    await expect(
      prisma.integrationEvent.findUniqueOrThrow({ where: { id: accepted.eventId } }),
    ).resolves.toMatchObject({
      status: 'PROCESSED',
      attemptCount: 1,
      payload: { name: 'Safe', password: '[REDACTED]' },
    });
    await request(server)
      .post(`/api/v1/integrations/webhooks/${connectionId}`)
      .set('content-type', 'application/json')
      .set('x-unicrm-timestamp', timestamp)
      .set('x-unicrm-signature', 'sha256='.padEnd(71, '0'))
      .send(raw)
      .expect(401);
    const expired = (Math.floor(Date.now() / 1000) - 1000).toString();
    await request(server)
      .post(`/api/v1/integrations/webhooks/${connectionId}`)
      .set('content-type', 'application/json')
      .set('x-unicrm-timestamp', expired)
      .set('x-unicrm-signature', signature)
      .send(raw)
      .expect(401);
    expect(
      await prisma.integrationEvent.count({
        where: { connectionId, externalEventId: payload.eventId },
      }),
    ).toBe(1);
  });

  it('enforces tenant isolation, mapping ownership, permissions, and strict target validation', async () => {
    expect(
      body<{ data: unknown[] }>(await agentB.get('/api/v1/integrations/connections').expect(200))
        .data,
    ).toHaveLength(0);
    const company = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/companies')
        .send({ name: 'Mapped Company' })
        .expect(201),
    ).data;
    await mutate(agentB, csrfB, 'post', '/api/v1/integrations/mappings')
      .send({
        connectionId,
        externalEntityType: 'CUSTOMER',
        externalEntityId: 'CUS-1',
        unicrmEntityType: 'COMPANY',
        unicrmEntityId: company.id,
      })
      .expect(404);
    await mutate(agentA, csrfA, 'post', '/api/v1/integrations/mappings')
      .send({
        connectionId,
        externalEntityType: 'CUSTOMER',
        externalEntityId: 'CUS-1',
        unicrmEntityType: 'COMPANY',
        unicrmEntityId: company.id,
      })
      .expect(201);
    await mutate(agentA, csrfA, 'post', '/api/v1/integrations/mappings')
      .send({
        connectionId,
        externalEntityType: 'CUSTOMER',
        externalEntityId: 'CUS-1',
        unicrmEntityType: 'COMPANY',
        unicrmEntityId: company.id,
      })
      .expect(409);
    await mutate(agentA, csrfA, 'post', '/api/v1/integrations/subscriptions')
      .send({
        name: 'Unsafe',
        connectionId,
        targetUrl: 'javascript:alert(1)',
        secret,
        eventTypes: ['lead.created'],
      })
      .expect(400);
    const viewer = await createRoleUser('Viewer');
    const viewerSession = await login(viewer.email);
    await viewerSession.agent.get('/api/v1/integrations/connections').expect(403);
  });

  it('signs outbound deliveries and records retryable failures without response-body retention', async () => {
    let receivedBody = '';
    let receivedSignature = '';
    const target = createServer((incoming, response) => {
      incoming.on('data', (chunk) => {
        receivedBody += String(chunk);
      });
      incoming.on('end', () => {
        receivedSignature = String(incoming.headers['x-unicrm-signature']);
        response.writeHead(204).end();
      });
    });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    const address = target.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    await mutate(agentA, csrfA, 'post', '/api/v1/integrations/subscriptions')
      .send({
        name: 'Local signed receiver',
        connectionId,
        targetUrl: `http://127.0.0.1:${address.port}/hook`,
        secret,
        eventTypes: ['company.created'],
      })
      .expect(201);
    await mutate(agentA, csrfA, 'post', '/api/v1/companies')
      .send({ name: 'Outbound Trigger' })
      .expect(201);
    const deliveryId = jobs.deliveries.at(-1);
    expect(deliveryId).toBeTruthy();
    await integrations.processDelivery(deliveryId!);
    expect(receivedSignature).toBe(
      `sha256=${createHmac('sha256', secret).update(receivedBody).digest('hex')}`,
    );
    await expect(
      prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId! } }),
    ).resolves.toMatchObject({ status: 'DELIVERED', statusCode: 204, attempt: 1 });
    await new Promise<void>((resolve, reject) =>
      target.close((error) => (error ? reject(error) : resolve())),
    );

    const failing = createServer((_incoming, response) =>
      response.writeHead(503).end('sensitive response'),
    );
    await new Promise<void>((resolve) => failing.listen(0, '127.0.0.1', resolve));
    const failingAddress = failing.address();
    if (!failingAddress || typeof failingAddress === 'string')
      throw new Error('Failure server did not bind');
    await prisma.webhookSubscription.updateMany({
      where: { organizationId: orgA },
      data: { active: false },
    });
    const failedSubscription = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/integrations/subscriptions')
        .send({
          name: 'Temporary failure',
          connectionId,
          targetUrl: `http://127.0.0.1:${failingAddress.port}/hook`,
          secret,
          eventTypes: ['company.created'],
        })
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'post', '/api/v1/companies')
      .send({ name: 'Failure Trigger' })
      .expect(201);
    const failedDelivery = await prisma.webhookDelivery.findFirstOrThrow({
      where: { subscriptionId: failedSubscription.id },
      orderBy: { createdAt: 'desc' },
    });
    await expect(integrations.processDelivery(failedDelivery.id)).rejects.toThrow(
      'Retryable webhook response: 503',
    );
    await expect(
      prisma.webhookDelivery.findUniqueOrThrow({ where: { id: failedDelivery.id } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      statusCode: 503,
      retryable: true,
      lastError: 'Target returned HTTP 503',
    });
    await new Promise<void>((resolve, reject) =>
      failing.close((error) => (error ? reject(error) : resolve())),
    );
  });

  async function createRoleUser(roleName: 'Viewer') {
    const role = await prisma.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId: orgA, name: roleName } },
    });
    const email = `${slugA}-${roleName.toLowerCase()}-${crypto.randomUUID()}@example.test`;
    const hash = await app.get(PasswordService).hash(password);
    return prisma.user.create({
      data: {
        organizationId: orgA,
        firstName: roleName,
        lastName: 'User',
        email,
        normalizedEmail: email,
        passwordHash: hash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: { roleId: role.id } },
      },
    });
  }

  async function login(email: string) {
    const agent = request.agent(server);
    const csrf = csrfFrom(
      await agent.post('/api/v1/auth/login').send({ email, password }).expect(200),
    );
    return { agent, csrf };
  }
});
