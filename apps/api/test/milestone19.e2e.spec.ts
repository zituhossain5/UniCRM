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
const password = 'Milestone-19-owner-password!';
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
  method: 'delete' | 'patch' | 'post',
  path: string,
) {
  return agent[method](path).set('origin', origin).set('x-csrf-token', csrf);
}

describe('Milestone 19 product and service catalog', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let orgA: string;
  let orgB: string;
  let ownerA: string;
  let ownerB: string;
  let companyA: string;
  let dealA: string;
  let categoryA: string;
  let categoryB: string;
  let itemA: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let viewerAgent: ReturnType<typeof request.agent>;
  let csrfA: string;
  let viewerCsrf: string;

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
    for (const [slug, label] of [
      [`catalog-a-${suffix}`, 'Catalog A'],
      [`catalog-b-${suffix}`, 'Catalog B'],
    ] as const)
      await bootstrap.run({
        organizationName: label,
        organizationSlug: slug,
        adminEmail: `${slug}@example.test`,
        adminPassword: password,
        adminFirstName: 'Owner',
        adminLastName: label.at(-1)!,
      });
    const a = await prisma.organization.findUniqueOrThrow({
      where: { slug: `catalog-a-${suffix}` },
      include: { users: true },
    });
    const b = await prisma.organization.findUniqueOrThrow({
      where: { slug: `catalog-b-${suffix}` },
      include: { users: true },
    });
    orgA = a.id;
    orgB = b.id;
    ownerA = a.users[0]!.id;
    ownerB = b.users[0]!.id;
    const viewerRole = await prisma.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId: orgA, name: 'Viewer' } },
    });
    const viewerEmail = `catalog-viewer-${suffix}@example.test`;
    await prisma.user.create({
      data: {
        organizationId: orgA,
        firstName: 'Catalog',
        lastName: 'Viewer',
        email: viewerEmail,
        normalizedEmail: viewerEmail,
        passwordHash: await app.get(PasswordService).hash(password),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: { roleId: viewerRole.id } },
      },
    });
    companyA = (
      await prisma.company.create({
        data: { organizationId: orgA, createdById: ownerA, name: 'ABC Ltd' },
      })
    ).id;
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgA, entityType: 'DEAL', isDefault: true },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    dealA = (
      await prisma.deal.create({
        data: {
          organizationId: orgA,
          createdById: ownerA,
          companyId: companyA,
          name: 'ABC Corporate Website Deal',
          pipelineId: pipeline.id,
          stageId: pipeline.stages[0]!.id,
          amount: '400000.00',
          currency: 'BDT',
        },
      })
    ).id;
    categoryB = (
      await prisma.catalogCategory.create({ data: { organizationId: orgB, name: 'Other tenant' } })
    ).id;
    agentA = request.agent(server);
    agentB = request.agent(server);
    viewerAgent = request.agent(server);
    csrfA = csrfFrom(
      await agentA
        .post('/api/v1/auth/login')
        .send({ email: `catalog-a-${suffix}@example.test`, password })
        .expect(200),
    );
    csrfFrom(
      await agentB
        .post('/api/v1/auth/login')
        .send({ email: `catalog-b-${suffix}@example.test`, password })
        .expect(200),
    );
    viewerCsrf = csrfFrom(
      await viewerAgent
        .post('/api/v1/auth/login')
        .send({ email: viewerEmail, password })
        .expect(200),
    );
  }, 30_000);

  afterAll(async () => {
    if (prisma)
      await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    await app?.close();
  }, 30_000);

  it('supports categories, Decimal prices, CRUD, SKU uniqueness, RBAC, and tenant isolation', async () => {
    categoryA = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/catalog/categories')
        .send({ name: 'Web Services' })
        .expect(201),
    ).data.id;
    itemA = body<{ data: { id: string; unitPrice: string; sku: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/catalog')
        .send({
          type: 'SERVICE',
          name: 'Corporate Website Development',
          sku: 'web-dev-001',
          categoryId: categoryA,
          description: 'Corporate website build',
          unitPrice: '150000.25',
          currency: 'bdt',
          taxRate: '5.1250',
        })
        .expect(201),
    ).data.id;
    const created = await prisma.catalogItem.findUniqueOrThrow({ where: { id: itemA } });
    expect(created.unitPrice.toString()).toBe('150000.25');
    expect(created.sku).toBe('WEB-DEV-001');

    await mutate(agentA, csrfA, 'post', '/api/v1/catalog')
      .send({
        type: 'SERVICE',
        name: 'Duplicate',
        sku: 'web-dev-001',
        unitPrice: '1',
        currency: 'BDT',
      })
      .expect(409);
    await mutate(viewerAgent, viewerCsrf, 'post', '/api/v1/catalog')
      .send({ type: 'PRODUCT', name: 'Denied', unitPrice: '1', currency: 'BDT' })
      .expect(403);
    await mutate(agentA, csrfA, 'post', '/api/v1/catalog')
      .send({
        type: 'PRODUCT',
        name: 'Cross tenant',
        categoryId: categoryB,
        unitPrice: '1',
        currency: 'BDT',
      })
      .expect(404);
    const list = body<{ data: Array<{ id: string }> }>(
      await agentB.get('/api/v1/catalog').expect(200),
    );
    expect(list.data.some(({ id }) => id === itemA)).toBe(false);
  });

  it('stores immutable quotation catalog snapshots while preserving manual lines', async () => {
    const quotation = body<{
      data: { id: string; items: Array<{ catalogItemName: string | null; unitPrice: string }> };
    }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
        .send({
          companyId: companyA,
          issueDate: '2026-09-15',
          currency: 'BDT',
          items: [
            {
              catalogItemId: itemA,
              description: 'Website snapshot',
              quantity: '1',
              unitPrice: '150000.25',
            },
            { description: 'Manual discovery', quantity: '1', unitPrice: '80000' },
          ],
        })
        .expect(201),
    ).data;
    expect(quotation.items[0]?.catalogItemName).toBe('Corporate Website Development');

    await mutate(agentA, csrfA, 'patch', `/api/v1/catalog/${itemA}`)
      .send({ name: 'Corporate Website Development 2027', unitPrice: '175000.00' })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/quotations/${quotation.id}`)
      .send({ notes: 'Snapshot retained after catalog update' })
      .expect(200);
    const persisted = body<{
      data: { items: Array<{ catalogItemName: string | null; unitPrice: string }> };
    }>(await agentA.get(`/api/v1/quotations/${quotation.id}`).expect(200));
    expect(persisted.data.items.map(({ unitPrice }) => unitPrice)).toEqual(['150000.25', '80000']);
    expect(persisted.data.items[0]?.catalogItemName).toBe('Corporate Website Development');

    const second = body<{ data: { items: Array<{ unitPrice: string }> } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
        .send({
          companyId: companyA,
          issueDate: '2026-09-15',
          currency: 'BDT',
          items: [
            {
              catalogItemId: itemA,
              description: 'New website quote',
              quantity: '1',
              unitPrice: '175000.00',
            },
          ],
        })
        .expect(201),
    );
    expect(second.data.items[0]?.unitPrice).toBe('175000');
  });

  it('associates expected Deal items without changing the Deal amount', async () => {
    const updated = body<{
      data: { amount: string; items: Array<{ amount: string; itemName: string }> };
    }>(
      await mutate(agentA, csrfA, 'patch', `/api/v1/deals/${dealA}/items`)
        .send({ items: [{ catalogItemId: itemA, quantity: '2.5', unitPrice: '175000.00' }] })
        .expect(200),
    ).data;
    expect(updated.amount).toBe('400000');
    expect(updated.items[0]).toMatchObject({
      itemName: 'Corporate Website Development 2027',
      amount: '437500',
    });
    const otherItem = await prisma.catalogItem.create({
      data: {
        organizationId: orgB,
        createdById: ownerB,
        type: 'SERVICE',
        name: 'Other',
        unitPrice: '1',
        currency: 'BDT',
      },
    });
    await mutate(agentA, csrfA, 'patch', `/api/v1/deals/${dealA}/items`)
      .send({ items: [{ catalogItemId: otherItem.id, quantity: '1', unitPrice: '1' }] })
      .expect(400);
  });

  it('imports and exports tenant-scoped catalog CSV with spreadsheet-injection protection', async () => {
    const csv =
      'name,type,sku,category,description,unitPrice,currency,taxRate,active\n=Formula Service,SERVICE,CSV-001,Imported,Safe row,25.50,BDT,7.5,true';
    const preview = body<{ data: { issues: unknown[]; totalRows: number } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/data-management/imports/preview')
        .send({ entityType: 'CATALOG', fileName: 'catalog.csv', csv })
        .expect(201),
    );
    expect(preview.data).toMatchObject({ issues: [], totalRows: 1 });
    await mutate(agentA, csrfA, 'post', '/api/v1/data-management/imports')
      .send({ entityType: 'CATALOG', fileName: 'catalog.csv', csv })
      .expect(201);
    const exported = body<{ data: { csv: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/data-management/exports')
        .send({ entityType: 'CATALOG' })
        .expect(201),
    );
    expect(exported.data.csv).toContain("'=Formula Service");
    expect(exported.data.csv).not.toContain('Other tenant');
  });

  it('keeps archived catalog snapshots readable and excludes items from active selection', async () => {
    await mutate(agentA, csrfA, 'delete', `/api/v1/catalog/${itemA}`).expect(200);
    const detail = body<{ data: { archivedAt: string; active: boolean } }>(
      await agentA.get(`/api/v1/catalog/${itemA}`).expect(200),
    );
    expect(detail.data.active).toBe(false);
    expect(detail.data.archivedAt).toBeTruthy();
    const list = body<{ data: Array<{ id: string }> }>(
      await agentA.get('/api/v1/catalog?active=true').expect(200),
    );
    expect(list.data.some(({ id }) => id === itemA)).toBe(false);
    await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
      .send({
        companyId: companyA,
        issueDate: '2026-09-15',
        currency: 'BDT',
        items: [
          { catalogItemId: itemA, description: 'Unavailable', quantity: '1', unitPrice: '175000' },
        ],
      })
      .expect(400);
  });
});
