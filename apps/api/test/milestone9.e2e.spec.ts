import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';

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
  method: 'delete' | 'patch' | 'post' | 'put',
  path: string,
) {
  return agent[method](path).set('origin', origin).set('x-csrf-token', csrf);
}

describe('Milestone 9 data portability and quality', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let slugA: string;
  let slugB: string;
  let orgA: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let csrfA: string;
  let csrfB: string;

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
    slugA = `m9-a-${crypto.randomUUID()}`;
    slugB = `m9-b-${crypto.randomUUID()}`;
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, suffix] of [
      [slugA, 'A'],
      [slugB, 'B'],
    ] as const)
      await bootstrap.run({
        organizationName: `Milestone 9 ${suffix}`,
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
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({
        where: { slug: { in: [slugA, slugB].filter(Boolean) } },
      });
    await app?.close();
  }, 30_000);

  it('previews, imports, records, and exports reviewed CRM CSV data', async () => {
    const csv = [
      'name,website,email,phone,status',
      'Acme Import,https://acme.example.test,hello@acme.example.test,+8801700000000,Active Client',
      'Bad Email,https://bad.example.test,not-email,+8801700000001,Prospect',
    ].join('\n');
    const preview = body<{
      data: { issues: Array<{ row: number; message: string }>; totalRows: number };
    }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/data-management/imports/preview')
        .send({ entityType: 'COMPANY', fileName: 'companies.csv', csv })
        .expect(201),
    ).data;
    expect(preview.totalRows).toBe(2);
    expect(preview.issues).toEqual([
      expect.objectContaining({ row: 3, message: 'Row 3: email is invalid' }),
    ]);
    const job = body<{
      data: { failedRows: number; status: string; successRows: number; totalRows: number };
    }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/data-management/imports')
        .send({ entityType: 'COMPANY', fileName: 'companies.csv', csv })
        .expect(201),
    ).data;
    expect(job).toMatchObject({
      failedRows: 1,
      status: 'COMPLETED_WITH_ERRORS',
      successRows: 1,
      totalRows: 2,
    });
    const exported = body<{ data: { csv: string; rowCount: number; status: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/data-management/exports')
        .send({ entityType: 'COMPANY' })
        .expect(201),
    ).data;
    expect(exported.status).toBe('COMPLETED');
    expect(exported.rowCount).toBeGreaterThanOrEqual(1);
    expect(exported.csv).toContain('Acme Import');
    const jobs = body<{ data: { exports: unknown[]; imports: unknown[] } }>(
      await agentA.get('/api/v1/data-management/jobs').expect(200),
    ).data;
    expect(jobs.imports).toHaveLength(1);
    expect(jobs.exports).toHaveLength(1);
  });

  it('enforces data-management permissions without weakening strict validation', async () => {
    const staff = await createRoleUser('Staff');
    const staffSession = await login(staff.email);
    await mutate(staffSession.agent, staffSession.csrf, 'post', '/api/v1/data-management/imports')
      .send({ entityType: 'COMPANY', fileName: 'blocked.csv', csv: 'name\nBlocked' })
      .expect(403);
    await mutate(staffSession.agent, staffSession.csrf, 'post', '/api/v1/data-management/exports')
      .send({ entityType: 'COMPANY' })
      .expect(201);
    await mutate(agentA, csrfA, 'post', '/api/v1/data-management/exports')
      .send({ entityType: 'COMPANY', filters: { rawSql: 'DROP TABLE companies' } })
      .expect(400);
  });

  it('detects duplicates, bulk updates records, and merges companies inside one tenant', async () => {
    const source = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/companies')
        .send({ name: 'Merge Candidate', email: 'merge@example.test' })
        .expect(201),
    ).data;
    const target = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/companies')
        .send({ name: 'Merge Candidate', email: 'merge@example.test' })
        .expect(201),
    ).data;
    const contact = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/contacts')
        .send({ firstName: 'Merge', lastName: 'Contact', companyId: source.id })
        .expect(201),
    ).data;
    const duplicates = body<{ data: Array<{ matches: Array<{ id: string }> }> }>(
      await agentA.get('/api/v1/data-management/duplicates?entityType=COMPANY').expect(200),
    ).data;
    expect(duplicates.some((group) => group.matches.some(({ id }) => id === source.id))).toBe(true);
    await mutate(agentA, csrfA, 'post', '/api/v1/data-management/bulk-update/companies')
      .send({ ids: [source.id, target.id], updates: { status: 'INACTIVE' } })
      .expect(201);
    expect(
      await prisma.company.count({
        where: { organizationId: orgA, id: { in: [source.id, target.id] }, status: 'INACTIVE' },
      }),
    ).toBe(2);
    await mutate(agentB, csrfB, 'post', '/api/v1/data-management/merges')
      .send({ entityType: 'COMPANY', sourceId: source.id, targetId: target.id })
      .expect(404);
    await mutate(agentA, csrfA, 'post', '/api/v1/data-management/merges')
      .send({ entityType: 'COMPANY', sourceId: source.id, targetId: target.id })
      .expect(201);
    await expect(
      prisma.contact.findUniqueOrThrow({ where: { id: contact.id } }),
    ).resolves.toMatchObject({ companyId: target.id });
    await expect(
      prisma.company.findUniqueOrThrow({ where: { id: source.id } }),
    ).resolves.toMatchObject({ status: 'ARCHIVED' });
  });

  async function createRoleUser(roleName: 'Staff') {
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
