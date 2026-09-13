import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PasswordService } from '../src/auth/password.service';
import { PrismaService } from '../src/database/prisma.service';

const origin = 'http://localhost:3000';
const password = 'Milestone-16-owner-password!';
const responseBody = <T>(response: request.Response) => response.body as T;
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

describe('Milestone 16 leads and deals', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;
  let ownerId: string;
  let agent: ReturnType<typeof request.agent>;
  let otherAgent: ReturnType<typeof request.agent>;
  let csrf: string;
  let otherCsrf: string;
  let viewerAgent: ReturnType<typeof request.agent>;
  let viewerCsrf: string;
  let companyId: string;
  let otherCompanyId: string;
  let leadId: string;
  let dealId: string;

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
      organizationName: 'Deals A',
      organizationSlug: `deals-a-${suffix}`,
      adminEmail: `deals-a-${suffix}@example.test`,
      adminPassword: password,
      adminFirstName: 'Owner',
      adminLastName: 'A',
    });
    await bootstrap.run({
      organizationName: 'Deals B',
      organizationSlug: `deals-b-${suffix}`,
      adminEmail: `deals-b-${suffix}@example.test`,
      adminPassword: password,
      adminFirstName: 'Owner',
      adminLastName: 'B',
    });
    const first = await prisma.organization.findUniqueOrThrow({
      where: { slug: `deals-a-${suffix}` },
      include: { users: true },
    });
    const second = await prisma.organization.findUniqueOrThrow({
      where: { slug: `deals-b-${suffix}` },
    });
    organizationId = first.id;
    otherOrganizationId = second.id;
    ownerId = first.users[0]!.id;
    const viewerRole = await prisma.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId, name: 'Viewer' } },
    });
    const viewerEmail = `deals-viewer-${suffix}@example.test`;
    await prisma.user.create({
      data: {
        organizationId,
        firstName: 'Deal',
        lastName: 'Viewer',
        email: viewerEmail,
        normalizedEmail: viewerEmail,
        passwordHash: await app.get(PasswordService).hash(password),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: { roleId: viewerRole.id } },
      },
    });
    agent = request.agent(server);
    otherAgent = request.agent(server);
    csrf = csrfFrom(
      await agent
        .post('/api/v1/auth/login')
        .send({ email: `deals-a-${suffix}@example.test`, password })
        .expect(200),
    );
    otherCsrf = csrfFrom(
      await otherAgent
        .post('/api/v1/auth/login')
        .send({ email: `deals-b-${suffix}@example.test`, password })
        .expect(200),
    );
    viewerAgent = request.agent(server);
    viewerCsrf = csrfFrom(
      await viewerAgent
        .post('/api/v1/auth/login')
        .send({ email: viewerEmail, password })
        .expect(200),
    );
    companyId = responseBody<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/companies')
        .send({ name: 'Qualified Account' })
        .expect(201),
    ).data.id;
    otherCompanyId = responseBody<{ data: { id: string } }>(
      await mutate(otherAgent, otherCsrf, 'post', '/api/v1/companies')
        .send({ name: 'Other Account' })
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

  it('keeps lead and deal pipelines explicitly separated', async () => {
    const leads = responseBody<{
      data: Array<{ entityType: string; stages: Array<{ name: string }> }>;
    }>(await agent.get('/api/v1/pipelines?entityType=LEAD').expect(200)).data;
    const deals = responseBody<{
      data: Array<{ entityType: string; stages: Array<{ name: string }> }>;
    }>(await agent.get('/api/v1/pipelines?entityType=DEAL').expect(200)).data;
    expect(leads.every(({ entityType }) => entityType === 'LEAD')).toBe(true);
    expect(deals.every(({ entityType }) => entityType === 'DEAL')).toBe(true);
    expect(deals[0]!.stages.map(({ name }) => name)).toEqual([
      'Discovery',
      'Qualified',
      'Proposal',
      'Negotiation',
      'Contract',
      'Won',
      'Lost',
    ]);
  });

  it('publishes Deal created, stage-changed, and won events into the existing automation engine', async () => {
    for (const triggerType of ['DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_WON']) {
      await mutate(agent, csrf, 'post', '/api/v1/automations')
        .send({
          name: `Milestone 16 ${triggerType}`,
          entityType: 'DEAL',
          triggerType,
          conditions: [],
          actions: [{ type: 'CREATE_NOTIFICATION', ownerId, title: triggerType }],
          active: true,
        })
        .expect(201);
    }
    const created = responseBody<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/deals')
        .send({ name: 'Automation event deal', companyId })
        .expect(201),
    ).data;
    expect(
      await prisma.automationRun.count({
        where: {
          organizationId,
          entityId: created.id,
          automationRule: { triggerType: 'DEAL_CREATED' },
        },
      }),
    ).toBe(1);
  });

  it('converts a lead transactionally and idempotently while hiding it from active leads', async () => {
    leadId = responseBody<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/leads')
        .send({
          title: 'Annual services',
          firstName: 'Ada',
          lastName: 'Rahman',
          email: 'ada.m16@example.test',
          ownerId,
          companyId,
          estimatedValue: '120000',
          priority: 'HIGH',
        })
        .expect(201),
    ).data.id;
    const converted = responseBody<{
      data: { companyId: string; contactId: string; deal: { id: string; sourceLeadId: string } };
    }>(
      await mutate(agent, csrf, 'post', `/api/v1/leads/${leadId}/convert`)
        .send({ createDeal: true, dealName: 'Annual services deal' })
        .expect(201),
    ).data;
    dealId = converted.deal.id;
    expect(converted.companyId).toBe(companyId);
    expect(converted.contactId).toBeTruthy();
    expect(converted.deal.sourceLeadId).toBe(leadId);
    await mutate(agent, csrf, 'post', `/api/v1/leads/${leadId}/convert`)
      .send({ createDeal: true })
      .expect(409);
    const active = responseBody<{ data: Array<{ id: string }> }>(
      await agent.get('/api/v1/leads?view=active').expect(200),
    ).data;
    const historical = responseBody<{ data: Array<{ id: string }> }>(
      await agent.get('/api/v1/leads?view=converted').expect(200),
    ).data;
    expect(active.some(({ id }) => id === leadId)).toBe(false);
    expect(historical.some(({ id }) => id === leadId)).toBe(true);
  });

  it('enforces tenant isolation for conversion and deal reads', async () => {
    const isolatedLead = responseBody<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/leads')
        .send({ title: 'Isolation lead' })
        .expect(201),
    ).data.id;
    await mutate(agent, csrf, 'post', `/api/v1/leads/${isolatedLead}/convert`)
      .send({ companyId: otherCompanyId, createDeal: true })
      .expect(400);
    await otherAgent.get(`/api/v1/deals/${dealId}`).expect(404);
  });

  it('keeps Viewer access read-only for deals and conversion', async () => {
    await viewerAgent.get('/api/v1/deals').expect(200);
    await mutate(viewerAgent, viewerCsrf, 'post', '/api/v1/deals')
      .send({ name: 'Forbidden deal', companyId })
      .expect(403);
    await mutate(viewerAgent, viewerCsrf, 'post', `/api/v1/leads/${leadId}/convert`)
      .send({ createDeal: false })
      .expect(403);
  });

  it('supports deal filters, tags, custom fields, stage history, and lost reasons', async () => {
    const tagId = responseBody<{ data: { id: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/tags').send({ name: 'Strategic' }).expect(201),
    ).data.id;
    await mutate(agent, csrf, 'post', '/api/v1/custom-fields')
      .send({
        entityType: 'DEAL',
        name: 'Contract Model',
        key: 'contract_model',
        fieldType: 'SELECT',
        options: ['Fixed', 'Retainer'],
        required: false,
      })
      .expect(201);
    await mutate(agent, csrf, 'patch', `/api/v1/deals/${dealId}`)
      .send({ tagIds: [tagId], customFields: { contract_model: 'Fixed' }, probability: 70 })
      .expect(200);
    const filtered = responseBody<{ data: Array<{ id: string }> }>(
      await agent
        .get(
          `/api/v1/deals?tag=${tagId}&customFields=${encodeURIComponent(JSON.stringify({ contract_model: 'Fixed' }))}`,
        )
        .expect(200),
    ).data;
    expect(filtered.map(({ id }) => id)).toContain(dealId);
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId, entityType: 'DEAL', isDefault: true },
      include: { stages: true },
    });
    const lost = pipeline.stages.find(({ isLost }) => isLost)!;
    await mutate(agent, csrf, 'patch', `/api/v1/deals/${dealId}/stage`)
      .send({ stageId: lost.id })
      .expect(400);
    await mutate(agent, csrf, 'patch', `/api/v1/deals/${dealId}/stage`)
      .send({ stageId: lost.id, lostReason: 'Budget deferred' })
      .expect(200);
    expect((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).lostReason).toBe(
      'Budget deferred',
    );
  });

  it('creates a project from a won deal once and links a quotation to the deal', async () => {
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId, entityType: 'DEAL', isDefault: true },
      include: { stages: true },
    });
    const won = pipeline.stages.find(({ isWon }) => isWon)!;
    await mutate(agent, csrf, 'patch', `/api/v1/deals/${dealId}/stage`)
      .send({ stageId: won.id })
      .expect(200);
    expect(
      await prisma.automationRun.count({
        where: {
          organizationId,
          entityId: dealId,
          automationRule: { triggerType: { in: ['DEAL_STAGE_CHANGED', 'DEAL_WON'] } },
        },
      }),
    ).toBe(3);
    const project = responseBody<{ data: { id: string; sourceDealId: string } }>(
      await mutate(agent, csrf, 'post', `/api/v1/deals/${dealId}/project`).send({}).expect(201),
    ).data;
    expect(project.sourceDealId).toBe(dealId);
    await mutate(agent, csrf, 'post', `/api/v1/deals/${dealId}/project`).send({}).expect(409);
    const quotation = responseBody<{ data: { id: string; dealId: string } }>(
      await mutate(agent, csrf, 'post', '/api/v1/quotations')
        .send({
          companyId,
          dealId,
          issueDate: '2026-09-13',
          currency: 'BDT',
          items: [{ description: 'Implementation', quantity: '1', unitPrice: '120000' }],
        })
        .expect(201),
    ).data;
    expect(quotation.dealId).toBe(dealId);
    expect(
      responseBody<{ data: { quotations: Array<{ id: string }> } }>(
        await agent.get(`/api/v1/deals/${dealId}`).expect(200),
      ).data.quotations.map(({ id }) => id),
    ).toContain(quotation.id);
  });
});
