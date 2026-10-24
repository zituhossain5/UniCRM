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
  const createdOrganizationIds = new Set<string>();

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
    await prisma?.organization.deleteMany({ where: { id: { in: [...createdOrganizationIds] } } });
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
    createdOrganizationIds.add(demoOrganizationId);
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
    const secondOrganizationId = (secondMe.body as { data: { organization: { id: string } } }).data
      .organization.id;
    createdOrganizationIds.add(secondOrganizationId);
    expect(secondOrganizationId).not.toBe(demoOrganizationId);
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

    const blocked = [
      ['post', '/api/v1/users/invitations'],
      ['patch', `/api/v1/roles/${crypto.randomUUID()}`],
      ['post', '/api/v1/mailboxes'],
      ['post', '/api/v1/integrations/connections'],
      ['post', `/api/v1/integrations/connections/${crypto.randomUUID()}/rotate-secret`],
      ['post', `/api/v1/integrations/webhooks/${crypto.randomUUID()}`],
      ['post', '/api/v1/data-management/exports'],
      ['post', '/api/v1/data-management/imports'],
      ['delete', '/api/v1/organization'],
      ['patch', '/api/v1/organization'],
      ['patch', '/api/v1/email-settings'],
      ['post', '/api/v1/auth/forgot-password'],
    ] as const;
    for (const [method, path] of blocked) {
      const result = await demoAgent[method](path)
        .set('origin', origin)
        .set('x-csrf-token', demoCsrf)
        .send({ email: 'visitor@example.test' })
        .expect(403);
      expect((result.body as { message: string }).message).toBe(
        'This action is unavailable in the public demo.',
      );
    }
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

  it('isolates demo attachments and enforces content and size limits', async () => {
    const project = await prisma.project.findFirstOrThrow({
      where: { organizationId: demoOrganizationId },
    });
    const uploaded = await demoAgent
      .post(`/api/v1/projects/${project.id}/attachments`)
      .set('origin', origin)
      .set('x-csrf-token', demoCsrf)
      .attach('file', Buffer.from('%PDF-1.4\nDemo'), {
        filename: 'demo-brief.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect((uploaded.body as { data: { storageKey: string } }).data.storageKey).toMatch(
      new RegExp(`^demo/${demoOrganizationId}/[0-9a-f-]{36}$`),
    );

    await demoAgent
      .post(`/api/v1/projects/${project.id}/attachments`)
      .set('origin', origin)
      .set('x-csrf-token', demoCsrf)
      .attach('file', Buffer.from('not a real PDF'), {
        filename: 'invalid.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    await demoAgent
      .post(`/api/v1/projects/${project.id}/attachments`)
      .set('origin', origin)
      .set('x-csrf-token', demoCsrf)
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1, 65), {
        filename: 'oversized.txt',
        contentType: 'text/plain',
      })
      .expect(400);
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
    createdOrganizationIds.add(normalOrganizationId);
    await app.get(DemoSeederService).seed(normalOrganizationId, normalUser.id);
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

    const [
      company,
      contact,
      deal,
      project,
      task,
      quotation,
      payment,
      thread,
      message,
      customerCase,
    ] = await Promise.all([
      prisma.company.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
      prisma.contact.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
      prisma.deal.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
      prisma.project.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
      prisma.task.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
      prisma.quotation.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
      prisma.payment.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
      prisma.emailThread.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
      prisma.emailMessage.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
      prisma.customerCase.findFirstOrThrow({ where: { organizationId: normalOrganizationId } }),
    ]);
    const attachment = await prisma.attachment.create({
      data: {
        organizationId: normalOrganizationId,
        projectId: project.id,
        fileName: 'normal-only.txt',
        mimeType: 'text/plain',
        size: 1,
        storageKey: crypto.randomUUID(),
        uploadedById: normalUser.id,
      },
    });
    const notification = await prisma.notification.findFirstOrThrow({
      where: { organizationId: normalOrganizationId },
    });
    const copiedIds: ReadonlyArray<[string, string]> = [
      ['/api/v1/organization', normalOrganizationId],
      ['/api/v1/users', normalUser.id],
      ['/api/v1/companies', company.id],
      ['/api/v1/contacts', contact.id],
      ['/api/v1/leads', normalLead.id],
      ['/api/v1/deals', deal.id],
      ['/api/v1/projects', project.id],
      ['/api/v1/tasks', task.id],
      ['/api/v1/quotations', quotation.id],
      ['/api/v1/payments', payment.id],
      ['/api/v1/mail/threads', thread.id],
      ['/api/v1/emails', message.id],
      ['/api/v1/cases', customerCase.id],
      ['/api/v1/attachments', attachment.id],
    ];
    for (const [base, id] of copiedIds) {
      await demoAgent.get(`${base}/${id}`).expect(404);
    }
    await demoAgent
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('origin', origin)
      .set('x-csrf-token', demoCsrf)
      .send({})
      .expect(404);

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

  it('isolates three concurrently created demo workspaces and cleans only one', async () => {
    const agents = [request.agent(server), request.agent(server), request.agent(server)];
    const starts = await Promise.all(
      agents.map((agent) => agent.post('/api/v1/demo/start').send({}).expect(201)),
    );
    const csrfTokens = starts.map((response) => cookieValue(response, 'unicrm_demo_csrf'));
    const identities = await Promise.all(
      agents.map((agent) => agent.get('/api/v1/auth/me').expect(200)),
    );
    const organizationIds = identities.map(
      (response) =>
        (response.body as { data: { organization: { id: string } } }).data.organization.id,
    );
    organizationIds.forEach((id) => createdOrganizationIds.add(id));
    expect(new Set(organizationIds).size).toBe(3);

    const titles = organizationIds.map((id, index) => `Isolation ${index + 1} ${id}`);
    await Promise.all(
      agents.map((agent, index) =>
        agent
          .post('/api/v1/leads')
          .set('origin', origin)
          .set('x-csrf-token', csrfTokens[index]!)
          .send({ title: titles[index] })
          .expect(201),
      ),
    );
    for (let agentIndex = 0; agentIndex < agents.length; agentIndex += 1) {
      for (let titleIndex = 0; titleIndex < titles.length; titleIndex += 1) {
        const result = await agents[agentIndex]!.get('/api/v1/leads')
          .query({ search: titles[titleIndex] })
          .expect(200);
        expect((result.body as { data: unknown[] }).data).toHaveLength(
          agentIndex === titleIndex ? 1 : 0,
        );
      }
    }

    const expiredAt = new Date(Date.now() - 1_000);
    await prisma.organization.update({
      where: { id: organizationIds[0] },
      data: { demoExpiresAt: expiredAt },
    });
    await app.get(DemoCleanupService).cleanupExpired();
    expect(await prisma.organization.findUnique({ where: { id: organizationIds[0] } })).toBeNull();
    await agents[1]!.get('/api/v1/auth/me').expect(200);
    await agents[2]!.get('/api/v1/auth/me').expect(200);
  }, 120_000);

  it('restarts only the authenticated demo workspace and preserves normal tenants', async () => {
    const previousOrganizationId = demoOrganizationId;
    const restarted = await demoAgent
      .post('/api/v1/demo/restart')
      .set('origin', origin)
      .set('x-csrf-token', demoCsrf)
      .send({})
      .expect(201);
    demoCsrf = cookieValue(restarted, 'unicrm_demo_csrf');

    const me = await demoAgent.get('/api/v1/auth/me').expect(200);
    const user = (
      me.body as {
        data: { id: string; organization: { id: string; mode: string; demoExpiresAt: string } };
      }
    ).data;
    demoUserId = user.id;
    demoOrganizationId = user.organization.id;
    createdOrganizationIds.add(demoOrganizationId);
    expect(demoOrganizationId).not.toBe(previousOrganizationId);
    expect(user.organization.mode).toBe('DEMO');
    expect(
      await prisma.organization.findUnique({ where: { id: previousOrganizationId } }),
    ).toBeNull();
    expect(
      await prisma.organization.findUnique({ where: { id: normalOrganizationId } }),
    ).not.toBeNull();
    expect(await prisma.lead.count({ where: { organizationId: demoOrganizationId } })).toBe(10);
  }, 60_000);

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
