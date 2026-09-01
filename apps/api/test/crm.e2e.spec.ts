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
const password = 'CRM-owner-password-2026!';

function body<T>(response: request.Response): T {
  return response.body as T;
}
function csrfFrom(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith('unicrm_csrf='));
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

describe('Milestone 3 CRM core', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let slugA: string;
  let slugB: string;
  let orgA: string;
  let orgB: string;
  let ownerA: string;
  let ownerB: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let csrfA: string;
  let csrfB: string;
  let companyA: string;
  let companyB: string;
  let contactA: string;
  let leadA: string;
  let qualifiedStageId: string;

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
    slugA = `crm-a-${crypto.randomUUID()}`;
    slugB = `crm-b-${crypto.randomUUID()}`;
    const bootstrap = app.get(IdentityBootstrapService);
    await bootstrap.run({
      organizationName: 'CRM A',
      organizationSlug: slugA,
      adminEmail: `${slugA}@example.test`,
      adminPassword: password,
      adminFirstName: 'Owner',
      adminLastName: 'A',
    });
    await bootstrap.run({
      organizationName: 'CRM B',
      organizationSlug: slugB,
      adminEmail: `${slugB}@example.test`,
      adminPassword: password,
      adminFirstName: 'Owner',
      adminLastName: 'B',
    });
    const a = await prisma.organization.findUniqueOrThrow({
      where: { slug: slugA },
      include: { users: true },
    });
    const b = await prisma.organization.findUniqueOrThrow({
      where: { slug: slugB },
      include: { users: true },
    });
    orgA = a.id;
    orgB = b.id;
    ownerA = a.users[0]!.id;
    ownerB = b.users[0]!.id;
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
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      for (const organizationId of [orgA, orgB].filter(Boolean)) {
        await prisma.activityLog.deleteMany({ where: { organizationId } });
        await prisma.followUp.deleteMany({ where: { organizationId } });
        await prisma.leadActivity.deleteMany({ where: { organizationId } });
        await prisma.lead.deleteMany({ where: { organizationId } });
        await prisma.contact.deleteMany({ where: { organizationId } });
        await prisma.company.deleteMany({ where: { organizationId } });
        await prisma.pipelineStage.deleteMany({ where: { organizationId } });
        await prisma.pipeline.deleteMany({ where: { organizationId } });
      }
      await prisma.organization.deleteMany({
        where: { slug: { in: [slugA, slugB].filter(Boolean) } },
      });
    }
    await app?.close();
  }, 30_000);

  it('initializes one idempotent default pipeline with stable won/lost flags', async () => {
    const first = body<{
      data: Array<{ id: string; stages: Array<{ name: string; isWon: boolean; isLost: boolean }> }>;
    }>(await agentA.get('/api/v1/pipelines').expect(200)).data;
    const second = body<{ data: Array<{ id: string; stages: unknown[] }> }>(
      await agentA.get('/api/v1/pipelines').expect(200),
    ).data;
    expect(first).toHaveLength(1);
    expect(first[0]!.stages).toHaveLength(7);
    expect(second[0]!.id).toBe(first[0]!.id);
    expect(first[0]!.stages.find((stage) => stage.name === 'Won')?.isWon).toBe(true);
    expect(first[0]!.stages.find((stage) => stage.name === 'Lost')?.isLost).toBe(true);
    await agentB.get('/api/v1/pipelines').expect(200);
    await agentB.get(`/api/v1/pipelines/${first[0]!.id}/stages`).expect(404);
  });

  it('creates, reads, updates, paginates, validates sorting, and isolates companies', async () => {
    const createdA = await mutate(agentA, csrfA, 'post', '/api/v1/companies')
      .send({ name: 'Unicode Prospect', email: 'hello@prospect.test', accountOwnerId: ownerA })
      .expect(201);
    companyA = body<{ data: { id: string } }>(createdA).data.id;
    const createdB = await mutate(agentB, csrfB, 'post', '/api/v1/companies')
      .send({ name: 'Other Tenant Company' })
      .expect(201);
    companyB = body<{ data: { id: string } }>(createdB).data.id;
    await agentA.get(`/api/v1/companies/${companyA}`).expect(200);
    await agentA.get(`/api/v1/companies/${companyB}`).expect(404);
    await mutate(agentA, csrfA, 'patch', `/api/v1/companies/${companyA}`)
      .send({ industry: 'Software', status: 'ACTIVE_CLIENT' })
      .expect(200);
    const list = body<{
      data: Array<{ id: string }>;
      meta: { page: number; limit: number; total: number };
    }>(await agentA.get('/api/v1/companies?page=1&limit=1&search=Unicode').expect(200));
    expect(list.data[0]?.id).toBe(companyA);
    expect(list.meta).toMatchObject({ page: 1, limit: 1, total: 1 });
    await agentA.get('/api/v1/companies?sort=DROP_TABLE').expect(400);
    await mutate(agentA, csrfA, 'patch', `/api/v1/companies/${companyA}`)
      .send({ accountOwnerId: ownerB })
      .expect(404);
  });

  it('associates contacts safely and rejects cross-tenant company IDs', async () => {
    const created = await mutate(agentA, csrfA, 'post', '/api/v1/contacts')
      .send({
        firstName: 'Mina',
        lastName: 'Rahman',
        companyId: companyA,
        email: 'mina@example.test',
        isPrimary: true,
      })
      .expect(201);
    contactA = body<{ data: { id: string; company: { id: string } } }>(created).data.id;
    expect(body<{ data: { company: { id: string } } }>(created).data.company.id).toBe(companyA);
    const secondPrimary = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/contacts')
        .send({
          firstName: 'Primary',
          lastName: 'Replacement',
          companyId: companyA,
          isPrimary: true,
        })
        .expect(201),
    ).data;
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contactA } })).isPrimary).toBe(
      false,
    );
    expect(
      body<{ data: { contacts: Array<{ id: string }> } }>(
        await agentA.get(`/api/v1/companies/${companyA}`).expect(200),
      ).data.contacts.map((contact) => contact.id),
    ).toEqual(expect.arrayContaining([contactA, secondPrimary.id]));
    await mutate(agentA, csrfA, 'post', '/api/v1/contacts')
      .send({ firstName: 'Wrong', lastName: 'Tenant', companyId: companyB })
      .expect(400);
    await mutate(agentA, csrfA, 'patch', `/api/v1/contacts/${contactA}`)
      .send({ jobTitle: 'CTO', email: 'MINA.UPDATED@example.test' })
      .expect(200);
    const list = body<{ data: Array<{ id: string; normalizedEmail: string }> }>(
      await agentA.get(`/api/v1/contacts?company=${companyA}&search=mina.updated`).expect(200),
    );
    expect(list.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: contactA, normalizedEmail: 'mina.updated@example.test' }),
      ]),
    );
    await mutate(agentA, csrfA, 'patch', `/api/v1/contacts/${contactA}`)
      .send({ companyId: companyB })
      .expect(400);
    await agentB.get(`/api/v1/contacts/${contactA}`).expect(404);
    await agentA.get('/api/v1/contacts?page=0').expect(400);
  });

  it('creates, filters, updates, assigns, and moves leads with automatic history', async () => {
    await mutate(agentA, csrfA, 'post', '/api/v1/leads')
      .send({ title: 'Standalone opportunity', email: 'standalone@example.test' })
      .expect(201);
    const created = await mutate(agentA, csrfA, 'post', '/api/v1/leads')
      .send({
        title: 'Website modernization',
        companyId: companyA,
        contactId: contactA,
        ownerId: ownerA,
        estimatedValue: '250000.50',
        currency: 'BDT',
        source: 'REFERRAL',
        priority: 'HIGH',
      })
      .expect(201);
    leadA = body<{ data: { id: string } }>(created).data.id;
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}`)
      .send({ notes: 'Decision maker confirmed' })
      .expect(200);
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgA, isDefault: true },
      include: { stages: true },
    });
    const qualified = pipeline.stages.find((stage) => stage.name === 'Qualified')!;
    qualifiedStageId = qualified.id;
    const beforeIdempotentOwner = await prisma.leadActivity.count({ where: { leadId: leadA } });
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/owner`)
      .send({ ownerId: ownerA })
      .expect(200);
    expect(await prisma.leadActivity.count({ where: { leadId: leadA } })).toBe(
      beforeIdempotentOwner,
    );
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/owner`)
      .send({ ownerId: null })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/owner`)
      .send({ ownerId: ownerA })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/stage`)
      .send({ stageId: qualified.id })
      .expect(200);
    const beforeIdempotentStage = await prisma.leadActivity.count({ where: { leadId: leadA } });
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/stage`)
      .send({ stageId: qualified.id })
      .expect(200);
    expect(await prisma.leadActivity.count({ where: { leadId: leadA } })).toBe(
      beforeIdempotentStage,
    );
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/owner`)
      .send({ ownerId: ownerB })
      .expect(400);
    const filtered = body<{ data: Array<{ id: string }> }>(
      await agentA
        .get(`/api/v1/leads?stage=${qualified.id}&owner=${ownerA}&sort=estimatedValue&order=desc`)
        .expect(200),
    );
    expect(filtered.data.map((lead) => lead.id)).toContain(leadA);
    const sourceAndPriority = body<{ data: Array<{ id: string }> }>(
      await agentA.get('/api/v1/leads?source=REFERRAL&priority=HIGH').expect(200),
    );
    expect(sourceAndPriority.data.map((lead) => lead.id)).toContain(leadA);
    await agentA.get('/api/v1/leads?order=sideways').expect(400);
    await agentA.get('/api/v1/leads?priority=CRITICAL').expect(400);
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}`)
      .send({ companyId: companyB })
      .expect(400);
    const activities = body<{ data: Array<{ type: string; title: string }> }>(
      await agentA.get(`/api/v1/leads/${leadA}/activities`).expect(200),
    );
    expect(activities.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'STATUS_CHANGE', title: 'Stage changed' }),
        expect.objectContaining({ type: 'OWNER_CHANGE', title: 'Owner changed' }),
        expect.objectContaining({ type: 'SYSTEM', title: 'Lead created' }),
      ]),
    );
    const lost = pipeline.stages.find((stage) => stage.isLost)!;
    const won = pipeline.stages.find((stage) => stage.isWon)!;
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/stage`)
      .send({ stageId: lost.id })
      .expect(400);
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/stage`)
      .send({ stageId: lost.id, lostReason: 'Budget paused' })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/stage`)
      .send({ stageId: won.id })
      .expect(200);
    expect(
      body<{ data: Array<{ id: string }> }>(
        await agentA.get('/api/v1/leads?view=won').expect(200),
      ).data.map((lead) => lead.id),
    ).toContain(leadA);
    await agentB.get('/api/v1/pipelines').expect(200);
    const pipelineB = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgB, isDefault: true },
      include: { stages: true },
    });
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/stage`)
      .send({ stageId: pipelineB.stages[0]!.id })
      .expect(400);
    await agentB.get(`/api/v1/leads/${leadA}`).expect(404);
  });

  it('records user activities and isolates the timeline', async () => {
    for (const type of ['NOTE', 'CALL', 'MEETING', 'EMAIL'] as const) {
      await mutate(agentA, csrfA, 'post', `/api/v1/leads/${leadA}/activities`)
        .send({ type, title: `${type} recorded`, description: 'CRM test activity' })
        .expect(201);
    }
    const activities = body<{ data: Array<{ type: string }> }>(
      await agentA.get(`/api/v1/leads/${leadA}/activities?limit=100`).expect(200),
    ).data;
    expect(activities.some((activity) => activity.type === 'NOTE')).toBe(true);
    expect(activities.some((activity) => activity.type === 'CALL')).toBe(true);
    expect(activities.some((activity) => activity.type === 'MEETING')).toBe(true);
    expect(activities.some((activity) => activity.type === 'EMAIL')).toBe(true);
    const beforeBackdated = await prisma.lead.findUniqueOrThrow({ where: { id: leadA } });
    await mutate(agentA, csrfA, 'post', `/api/v1/leads/${leadA}/activities`)
      .send({
        type: 'NOTE',
        title: 'Historical note',
        occurredAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);
    const afterBackdated = await prisma.lead.findUniqueOrThrow({ where: { id: leadA } });
    expect(afterBackdated.lastActivityAt?.toISOString()).toBe(
      beforeBackdated.lastActivityAt?.toISOString(),
    );
    await agentB.get(`/api/v1/leads/${leadA}/activities`).expect(404);
    await mutate(agentB, csrfB, 'post', `/api/v1/leads/${leadA}/activities`)
      .send({ type: 'NOTE', title: 'Cross tenant' })
      .expect(404);
  });

  it('queries overdue follow-ups and supports complete, cancel, and tenant isolation', async () => {
    const overdue = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/leads/${leadA}/follow-ups`)
        .send({
          dueAt: new Date(Date.now() - 86_400_000).toISOString(),
          type: 'CALL',
          notes: 'Past due',
        })
        .expect(201),
    ).data;
    const future = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/leads/${leadA}/follow-ups`)
        .send({ dueAt: new Date(Date.now() + 86_400_000).toISOString(), type: 'MEETING' })
        .expect(201),
    ).data;
    const unassigned = body<{ data: { id: string; assignedToId: string | null } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/leads/${leadA}/follow-ups`)
        .send({
          dueAt: new Date(Date.now() + 172_800_000).toISOString(),
          type: 'EMAIL',
          assignedToId: null,
        })
        .expect(201),
    ).data;
    expect(unassigned.assignedToId).toBeNull();
    const today = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/leads/${leadA}/follow-ups`)
        .send({ dueAt: new Date().toISOString(), type: 'CALL' })
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'post', `/api/v1/leads/${leadA}/follow-ups`)
      .send({ dueAt: new Date().toISOString(), assignedToId: ownerB })
      .expect(400);
    const overdueList = body<{ data: Array<{ id: string }> }>(
      await agentA.get('/api/v1/follow-ups?scope=overdue&mine=true').expect(200),
    ).data;
    expect(overdueList.map((item) => item.id)).toContain(overdue.id);
    expect(overdueList.map((item) => item.id)).not.toContain(unassigned.id);
    await agentA.get('/api/v1/follow-ups?mine=definitely').expect(400);
    const rescheduledAt = new Date(Date.now() + 259_200_000).toISOString();
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/follow-ups/${future.id}`)
      .send({ dueAt: rescheduledAt, notes: 'Moved after customer request' })
      .expect(200);
    expect(
      await prisma.activityLog.count({
        where: { entityId: future.id, action: 'FOLLOW_UP_RESCHEDULED' },
      }),
    ).toBe(1);
    const upcoming = body<{ data: Array<{ id: string }> }>(
      await agentA.get('/api/v1/follow-ups?scope=upcoming').expect(200),
    ).data;
    expect(upcoming.map((item) => item.id)).toEqual(
      expect.arrayContaining([future.id, unassigned.id]),
    );
    expect(
      body<{ data: Array<{ id: string }> }>(
        await agentA.get('/api/v1/follow-ups?scope=today').expect(200),
      ).data.map((item) => item.id),
    ).toContain(today.id);
    expect(
      body<{ data: Array<{ id: string }> }>(
        await agentB.get(`/api/v1/follow-ups?lead=${leadA}`).expect(200),
      ).data,
    ).toHaveLength(0);
    await mutate(
      agentA,
      csrfA,
      'post',
      `/api/v1/leads/${leadA}/follow-ups/${overdue.id}/complete`,
    ).expect(201);
    await mutate(
      agentA,
      csrfA,
      'post',
      `/api/v1/leads/${leadA}/follow-ups/${future.id}/cancel`,
    ).expect(201);
    await mutate(
      agentB,
      csrfB,
      'post',
      `/api/v1/leads/${leadA}/follow-ups/${overdue.id}/complete`,
    ).expect(404);
  });

  it('enforces read-only Viewer and non-destructive Staff role mappings', async () => {
    const passwords = app.get(PasswordService);
    const hash = await passwords.hash(password);
    for (const roleName of ['Viewer', 'Staff'] as const) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { organizationId_name: { organizationId: orgA, name: roleName } },
      });
      const user = await prisma.user.create({
        data: {
          organizationId: orgA,
          firstName: roleName,
          lastName: 'User',
          email: `${slugA}-${roleName.toLowerCase()}@example.test`,
          normalizedEmail: `${slugA}-${roleName.toLowerCase()}@example.test`,
          passwordHash: hash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          userRoles: { create: { roleId: role.id } },
        },
      });
      const roleAgent = request.agent(server);
      const roleCsrf = csrfFrom(
        await roleAgent
          .post('/api/v1/auth/login')
          .send({ email: user.email, password })
          .expect(200),
      );
      await roleAgent.get('/api/v1/leads').expect(200);
      if (roleName === 'Viewer')
        await mutate(roleAgent, roleCsrf, 'post', '/api/v1/leads')
          .send({ title: 'Forbidden' })
          .expect(403);
      if (roleName === 'Viewer')
        await mutate(roleAgent, roleCsrf, 'post', '/api/v1/companies')
          .send({ name: 'Forbidden company' })
          .expect(403);
      if (roleName === 'Viewer')
        await mutate(roleAgent, roleCsrf, 'post', `/api/v1/leads/${leadA}/activities`)
          .send({ type: 'NOTE', title: 'Forbidden activity' })
          .expect(403);
      if (roleName === 'Viewer')
        await mutate(roleAgent, roleCsrf, 'patch', `/api/v1/leads/${leadA}/stage`)
          .send({ stageId: qualifiedStageId })
          .expect(403);
      if (roleName === 'Staff') {
        await mutate(roleAgent, roleCsrf, 'patch', `/api/v1/leads/${leadA}/owner`)
          .send({ ownerId: user.id })
          .expect(403);
        await mutate(roleAgent, roleCsrf, 'delete', `/api/v1/leads/${leadA}`).expect(403);
      }
    }
  }, 30_000);

  it('keeps archived CRM records historically readable but immutable', async () => {
    const disposableContact = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/contacts')
        .send({ firstName: 'Archive', lastName: 'Contact', companyId: companyA })
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'delete', `/api/v1/contacts/${disposableContact.id}`).expect(200);
    await agentA.get(`/api/v1/contacts/${disposableContact.id}`).expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/contacts/${disposableContact.id}`)
      .send({ jobTitle: 'Changed after archive' })
      .expect(409);
    await mutate(agentA, csrfA, 'delete', `/api/v1/contacts/${disposableContact.id}`).expect(409);

    const disposableLead = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/leads')
        .send({ title: 'Archive lifecycle' })
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'delete', `/api/v1/leads/${disposableLead.id}`).expect(200);
    await agentA.get(`/api/v1/leads/${disposableLead.id}`).expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${disposableLead.id}`)
      .send({ title: 'Changed after archive' })
      .expect(409);
    await mutate(agentA, csrfA, 'delete', `/api/v1/leads/${disposableLead.id}`).expect(409);

    await mutate(agentA, csrfA, 'patch', `/api/v1/companies/${companyA}`)
      .send({ status: 'ARCHIVED' })
      .expect(400);
    await mutate(agentA, csrfA, 'delete', `/api/v1/companies/${companyA}`).expect(200);
    await agentA.get(`/api/v1/companies/${companyA}`).expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/companies/${companyA}`)
      .send({ industry: 'Changed after archive' })
      .expect(409);
    await mutate(agentA, csrfA, 'delete', `/api/v1/companies/${companyA}`).expect(409);
    const archived = body<{ data: Array<{ id: string }> }>(
      await agentA.get('/api/v1/companies?status=ARCHIVED').expect(200),
    );
    expect(archived.data.map((company) => company.id)).toContain(companyA);
  });
});
