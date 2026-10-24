import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service';
import { DemoCleanupService } from '../src/demo/demo-cleanup.service';
import { DemoSeederService } from '../src/demo/demo-seeder.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { TokenService } from '../src/auth/token.service';
import { CrmEmailService } from '../src/email/crm-email.service';

const origin = 'http://localhost:3000';

function cookieValue(response: request.Response, name: string): string {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`${name} cookie was not set`);
  return decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
}

describe('Milestone 21A secure public demo foundation', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let demoAgent: ReturnType<typeof request.agent>;
  let demoOrganizationId: string;
  let demoUserId: string;
  let demoCsrf: string;
  let normalOrganizationId: string;
  const marker = crypto.randomUUID();

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    process.env.CORS_ORIGINS = origin;
    process.env.DEMO_START_RATE_LIMIT_MAX = '1000';
    process.env.DEMO_RECORD_RATE_LIMIT_MAX = '1000';
    process.env.EMAIL_DELIVERY_MODE = 'queue';
    process.env.EMAIL_TRANSPORT = 'console';
    process.env.NODE_ENV = 'test';
    process.env.RUNTIME_MODE = 'demo';
    process.env.SESSION_COOKIE_NAME = 'unicrm_demo_session';
    process.env.CSRF_COOKIE_NAME = 'unicrm_demo_csrf';
    process.env.SESSION_TTL_SECONDS = '5400';
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
  }, 30_000);

  afterAll(async () => {
    await prisma?.organization.deleteMany({
      where: {
        OR: [
          { mode: 'DEMO', name: { startsWith: 'UniCRM Demo' } },
          { slug: { startsWith: `demo-normal-${marker}` } },
        ],
      },
    });
    await app?.close();
  }, 30_000);

  it('creates a unique, temporary, seeded demo organization and authenticates it', async () => {
    demoAgent = request.agent(server);
    const first = await demoAgent.post('/api/v1/demo/start').send({}).expect(201);
    demoCsrf = cookieValue(first, 'unicrm_demo_csrf');
    const me = await demoAgent.get('/api/v1/auth/me').expect(200);
    const user = (
      me.body as {
        data: { id: string; organization: { id: string; mode: string; demoExpiresAt: string } };
      }
    ).data;
    demoUserId = user.id;
    demoOrganizationId = user.organization.id;
    expect(user.organization.mode).toBe('DEMO');
    expect(new Date(user.organization.demoExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const counts = await Promise.all([
      prisma.company.count({ where: { organizationId: demoOrganizationId } }),
      prisma.contact.count({ where: { organizationId: demoOrganizationId } }),
      prisma.lead.count({ where: { organizationId: demoOrganizationId } }),
      prisma.deal.count({ where: { organizationId: demoOrganizationId } }),
      prisma.project.count({ where: { organizationId: demoOrganizationId } }),
      prisma.task.count({ where: { organizationId: demoOrganizationId } }),
      prisma.customerCase.count({ where: { organizationId: demoOrganizationId } }),
      prisma.emailThread.count({ where: { organizationId: demoOrganizationId } }),
    ]);
    expect(counts).toEqual([5, 9, 10, 6, 3, 12, 3, 3]);

    const secondAgent = request.agent(server);
    await secondAgent.post('/api/v1/demo/start').send({}).expect(201);
    const secondMe = await secondAgent.get('/api/v1/auth/me').expect(200);
    expect(
      (secondMe.body as { data: { organization: { id: string } } }).data.organization.id,
    ).not.toBe(demoOrganizationId);
  }, 60_000);

  it('keeps the seeder idempotent and blocks sensitive direct API calls', async () => {
    const before = await prisma.company.count({ where: { organizationId: demoOrganizationId } });
    await app.get(DemoSeederService).seed(demoOrganizationId, demoUserId);
    expect(await prisma.company.count({ where: { organizationId: demoOrganizationId } })).toBe(
      before,
    );

    const response = await demoAgent
      .post('/api/v1/users/invitations')
      .set('origin', origin)
      .set('x-csrf-token', demoCsrf)
      .send({})
      .expect(403);
    expect((response.body as { message: string }).message).toBe(
      'This action is unavailable in the public demo.',
    );
    await demoAgent
      .post('/api/v1/integrations/subscriptions')
      .set('origin', origin)
      .set('x-csrf-token', demoCsrf)
      .send({})
      .expect(403);
    await demoAgent
      .post('/api/v1/data-management/exports')
      .set('origin', origin)
      .set('x-csrf-token', demoCsrf)
      .send({})
      .expect(403);
  });

  it('simulates CRM email without opening an external transport', async () => {
    const lead = await prisma.lead.findFirstOrThrow({
      where: { organizationId: demoOrganizationId },
    });
    const message = await app.get(CrmEmailService).send(
      {
        userId: demoUserId,
        organizationId: demoOrganizationId,
        sessionId: 'test-session',
        csrfTokenHash: 'test',
        roles: ['Owner'],
        permissions: ['email.send'],
        organizationMode: 'DEMO',
        demoExpiresAt: new Date(Date.now() + 60_000),
      },
      {
        relatedEntityType: 'LEAD',
        relatedEntityId: lead.id,
        to: ['prospect@example.invalid'],
        subject: 'Demo follow-up',
        body: 'This message must never leave the demo runtime.',
      },
    );
    await app.get(CrmEmailService).processDelivery(message.id, 0, 1);
    expect(
      await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } }),
    ).toMatchObject({ status: 'SENT', simulated: true });
  });

  it('rejects NORMAL tenant sessions and keeps tenant-scoped reads isolated', async () => {
    const slug = `demo-normal-${marker}`;
    const email = `${slug}@example.test`;
    await app.get(IdentityBootstrapService).run({
      organizationName: 'Normal isolation tenant',
      organizationSlug: slug,
      adminEmail: email,
      adminPassword: 'Normal-password-2026!',
      adminFirstName: 'Normal',
      adminLastName: 'Owner',
    });
    const normalUser = await prisma.user.findUniqueOrThrow({ where: { normalizedEmail: email } });
    normalOrganizationId = normalUser.organizationId;
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: normalOrganizationId, entityType: 'LEAD' },
      include: { stages: { orderBy: { position: 'asc' }, take: 1 } },
    });
    const normalLead = await prisma.lead.create({
      data: {
        organizationId: normalOrganizationId,
        title: 'Production-only lead',
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        createdById: normalUser.id,
      },
    });
    await demoAgent.get(`/api/v1/leads/${normalLead.id}`).expect(404);

    const tokens = app.get(TokenService);
    const rawToken = tokens.generate();
    await prisma.authSession.create({
      data: {
        organizationId: normalOrganizationId,
        userId: normalUser.id,
        tokenHash: tokens.hash(rawToken),
        csrfTokenHash: tokens.hash(tokens.generate()),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await request(server)
      .get('/api/v1/auth/me')
      .set('Cookie', `unicrm_demo_session=${rawToken}`)
      .expect(401);
  });

  it('rejects expiry and cleanup deletes only expired DEMO organizations', async () => {
    await prisma.organization.update({
      where: { id: demoOrganizationId },
      data: { demoExpiresAt: new Date(Date.now() - 1_000) },
    });
    await demoAgent.get('/api/v1/auth/me').expect(401);
    expect(await app.get(DemoCleanupService).cleanupExpired()).toBeGreaterThanOrEqual(1);
    expect(await prisma.organization.findUnique({ where: { id: demoOrganizationId } })).toBeNull();
    expect(
      await prisma.organization.findUnique({ where: { id: normalOrganizationId } }),
    ).not.toBeNull();
    expect(await app.get(DemoCleanupService).cleanupExpired()).toBe(0);
  });
});
