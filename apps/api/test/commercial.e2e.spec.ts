import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalStorageService } from '../src/attachments/local-storage.service';
import { PasswordService } from '../src/auth/password.service';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';

const origin = 'http://localhost:3000';
const password = 'Commercial-owner-password-2026!';
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

describe('Milestone 5 quotations and payments', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let storage: LocalStorageService;
  let orgA: string;
  let orgB: string;
  let companyA: string;
  let companyB: string;
  let contactA: string;
  let contactB: string;
  let leadA: string;
  let leadB: string;
  let projectA: string;
  let projectB: string;
  let quotationA: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let csrfA: string;
  let csrfB: string;
  const slugA = `commercial-a-${crypto.randomUUID()}`;
  const slugB = `commercial-b-${crypto.randomUUID()}`;

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
    storage = app.get(LocalStorageService);
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, label] of [
      [slugA, 'Commercial A'],
      [slugB, 'Commercial B'],
    ] as const)
      await bootstrap.run({
        organizationName: label,
        organizationSlug: slug,
        adminEmail: `${slug}@example.test`,
        adminPassword: password,
        adminFirstName: 'Owner',
        adminLastName: label.at(-1)!,
      });
    const a = await prisma.organization.findUniqueOrThrow({ where: { slug: slugA } });
    const b = await prisma.organization.findUniqueOrThrow({ where: { slug: slugB } });
    orgA = a.id;
    orgB = b.id;
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
    companyA = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/companies')
        .send({ name: 'Nova Digital Ltd.' })
        .expect(201),
    ).data.id;
    companyB = body<{ data: { id: string } }>(
      await mutate(agentB, csrfB, 'post', '/api/v1/companies')
        .send({ name: 'Other Tenant Ltd.' })
        .expect(201),
    ).data.id;
    contactA = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/contacts')
        .send({
          companyId: companyA,
          firstName: 'Farhan',
          lastName: 'Chowdhury',
          email: `farhan-${crypto.randomUUID()}@example.test`,
        })
        .expect(201),
    ).data.id;
    contactB = body<{ data: { id: string } }>(
      await mutate(agentB, csrfB, 'post', '/api/v1/contacts')
        .send({ companyId: companyB, firstName: 'Other', lastName: 'Contact' })
        .expect(201),
    ).data.id;
    leadA = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/leads')
        .send({
          title: 'Corporate Website Redesign',
          companyId: companyA,
          contactId: contactA,
          estimatedValue: '120000',
          currency: 'BDT',
        })
        .expect(201),
    ).data.id;
    leadB = body<{ data: { id: string } }>(
      await mutate(agentB, csrfB, 'post', '/api/v1/leads')
        .send({ title: 'Foreign lead', companyId: companyB, contactId: contactB })
        .expect(201),
    ).data.id;
    projectA = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/projects')
        .send({
          name: 'Corporate Website Redesign',
          companyId: companyA,
          projectValue: '120000',
          currency: 'BDT',
        })
        .expect(201),
    ).data.id;
    projectB = body<{ data: { id: string } }>(
      await mutate(agentB, csrfB, 'post', '/api/v1/projects')
        .send({ name: 'Foreign project', companyId: companyB })
        .expect(201),
    ).data.id;
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      const snapshots = await prisma.quotation.findMany({
        where: { organizationId: { in: [orgA, orgB].filter(Boolean) } },
        select: { pdfSnapshotKey: true },
      });
      for (const item of snapshots)
        if (item.pdfSnapshotKey) await storage.delete(item.pdfSnapshotKey);
      for (const organizationId of [orgA, orgB].filter(Boolean)) {
        await prisma.activityLog.deleteMany({ where: { organizationId } });
        await prisma.payment.deleteMany({ where: { organizationId } });
        await prisma.quotationItem.deleteMany({ where: { organizationId } });
        await prisma.quotation.deleteMany({ where: { organizationId } });
        await prisma.quotationNumberCounter.deleteMany({ where: { organizationId } });
        await prisma.projectMember.deleteMany({ where: { organizationId } });
        await prisma.project.deleteMany({ where: { organizationId } });
        await prisma.leadActivity.deleteMany({ where: { organizationId } });
        await prisma.lead.deleteMany({ where: { organizationId } });
        await prisma.contact.deleteMany({ where: { organizationId } });
        await prisma.company.deleteMany({ where: { organizationId } });
        await prisma.pipelineStage.deleteMany({ where: { organizationId } });
        await prisma.pipeline.deleteMany({ where: { organizationId } });
      }
      await prisma.organization.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
    }
    await app?.close();
  }, 30_000);

  const quotationPayload = (overrides: Record<string, unknown> = {}) => ({
    companyId: companyA,
    contactId: contactA,
    leadId: leadA,
    projectId: projectA,
    issueDate: '2026-09-03',
    expiryDate: '2026-09-17',
    currency: 'BDT',
    items: [
      { description: 'Website UI Design', quantity: '1', unitPrice: '40000' },
      { description: 'Frontend Development', quantity: '1', unitPrice: '50000' },
      { description: 'Backend Integration', quantity: '1', unitPrice: '30000' },
    ],
    ...overrides,
  });

  it('calculates totals with Decimal values and rejects cross-tenant associations', async () => {
    const response = await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
      .send(quotationPayload({ discountType: 'PERCENTAGE', discountValue: '10', taxRate: '15' }))
      .expect(201);
    const quotation = body<{
      data: {
        id: string;
        subtotal: string;
        discountAmount: string;
        taxAmount: string;
        total: string;
        quotationNumber: string;
      };
    }>(response).data;
    quotationA = quotation.id;
    expect(quotation.subtotal).toBe('120000');
    expect(quotation.discountAmount).toBe('12000');
    expect(quotation.taxAmount).toBe('16200');
    expect(quotation.total).toBe('124200');
    expect(quotation.quotationNumber).toMatch(/^QT-\d{6}$/);
    await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
      .send(quotationPayload({ contactId: contactB }))
      .expect(404);
    await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
      .send(quotationPayload({ leadId: leadB }))
      .expect(404);
    await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
      .send(quotationPayload({ projectId: projectB }))
      .expect(404);
    await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
      .send(quotationPayload({ companyId: companyB }))
      .expect(404);
    await agentB.get(`/api/v1/quotations/${quotationA}`).expect(404);
  });

  it('edits only drafts, snapshots the sent PDF, and enforces state transitions', async () => {
    await mutate(agentA, csrfA, 'patch', `/api/v1/quotations/${quotationA}`)
      .send({
        notes: 'Ready for client review',
        items: [{ description: 'Delivery', quantity: '2.5', unitPrice: '1000' }],
      })
      .expect(200)
      .expect((response) =>
        expect(body<{ data: { total: string } }>(response).data.total).toBe('2587.5'),
      );
    await agentA
      .get(`/api/v1/quotations/${quotationA}/pdf`)
      .expect(200)
      .expect('content-type', /application\/pdf/);
    const sent = body<{ data: { status: string; pdfSnapshotAt: string; pdfSnapshotKey?: string } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/quotations/${quotationA}/send`).expect(201),
    ).data;
    expect(sent.status).toBe('SENT');
    expect(sent.pdfSnapshotAt).toBeTruthy();
    expect(sent.pdfSnapshotKey).toBeUndefined();
    expect(
      (
        await prisma.quotation.findUniqueOrThrow({
          where: { id: quotationA },
          select: { pdfSnapshotKey: true },
        })
      ).pdfSnapshotKey,
    ).toMatch(/[0-9a-f-]{36}/);
    await mutate(agentA, csrfA, 'patch', `/api/v1/quotations/${quotationA}`)
      .send({ notes: 'Forbidden edit' })
      .expect(409);
    await mutate(agentA, csrfA, 'post', `/api/v1/quotations/${quotationA}/accept`)
      .expect(201)
      .expect((response) =>
        expect(body<{ data: { status: string } }>(response).data.status).toBe('ACCEPTED'),
      );
    await mutate(agentA, csrfA, 'post', `/api/v1/quotations/${quotationA}/reject`).expect(409);
  });

  it('allocates unique quotation numbers under concurrent creation', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_value, index) =>
        mutate(agentA, csrfA, 'post', '/api/v1/quotations').send(
          quotationPayload({
            contactId: null,
            leadId: null,
            projectId: null,
            items: [{ description: `Concurrent ${index}`, quantity: '1', unitPrice: '1' }],
          }),
        ),
      ),
    );
    for (const response of responses) expect(response.status).toBe(201);
    const numbers = responses.map(
      (response) => body<{ data: { quotationNumber: string } }>(response).data.quotationNumber,
    );
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('supports fixed discounts plus rejected and date-driven expired states', async () => {
    const fixed = body<{ data: { id: string; discountAmount: string; total: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
        .send(quotationPayload({ discountType: 'FIXED', discountValue: '20000', taxRate: null }))
        .expect(201),
    ).data;
    expect(fixed.discountAmount).toBe('20000');
    expect(fixed.total).toBe('100000');
    await mutate(agentA, csrfA, 'post', `/api/v1/quotations/${fixed.id}/send`).expect(201);
    await mutate(agentA, csrfA, 'post', `/api/v1/quotations/${fixed.id}/reject`)
      .expect(201)
      .expect((response) =>
        expect(body<{ data: { status: string } }>(response).data.status).toBe('REJECTED'),
      );
    const expired = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/quotations')
        .send(
          quotationPayload({
            issueDate: '2026-01-01',
            expiryDate: '2026-01-02',
            contactId: null,
            leadId: null,
            projectId: null,
          }),
        )
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'post', `/api/v1/quotations/${expired.id}/send`).expect(201);
    await agentA
      .get(`/api/v1/quotations/${expired.id}`)
      .expect(200)
      .expect((response) =>
        expect(body<{ data: { status: string } }>(response).data.status).toBe('EXPIRED'),
      );
  });

  it('records payments once in project and quotation aggregates and validates relationships', async () => {
    const payment = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/payments')
        .send({
          companyId: companyA,
          projectId: projectA,
          quotationId: quotationA,
          amount: '50000.25',
          currency: 'BDT',
          paymentDate: '2026-09-03',
          method: 'BANK_TRANSFER',
          reference: 'BANK-DEMO-001',
        })
        .expect(201),
    ).data;
    const project = body<{ data: { financials: { received: string; outstanding: string } } }>(
      await agentA.get(`/api/v1/projects/${projectA}`).expect(200),
    ).data;
    expect(project.financials.received).toBe('50000.25');
    expect(project.financials.outstanding).toBe('69999.75');
    const quotation = body<{ data: { paid: string } }>(
      await agentA.get(`/api/v1/quotations/${quotationA}`).expect(200),
    ).data;
    expect(quotation.paid).toBe('50000.25');
    await mutate(agentA, csrfA, 'post', '/api/v1/payments')
      .send({
        companyId: companyA,
        projectId: projectB,
        amount: '1',
        currency: 'BDT',
        paymentDate: '2026-09-03',
      })
      .expect(404);
    await mutate(agentA, csrfA, 'post', '/api/v1/payments')
      .send({
        companyId: companyA,
        quotationId: quotationA,
        amount: '0',
        currency: 'BDT',
        paymentDate: '2026-09-03',
      })
      .expect(400);
    await agentA
      .get('/api/v1/payments?search=BANK-DEMO-001&method=BANK_TRANSFER')
      .expect(200)
      .expect((response) =>
        expect(
          body<{ data: Array<{ id: string }> }>(response).data.map((item) => item.id),
        ).toContain(payment.id),
      );
    await mutate(agentA, csrfA, 'patch', `/api/v1/payments/${payment.id}`)
      .send({ amount: '50000', notes: 'Corrected' })
      .expect(200);
    await mutate(agentA, csrfA, 'delete', `/api/v1/payments/${payment.id}`).expect(200);
    await agentA
      .get(`/api/v1/projects/${projectA}`)
      .expect(200)
      .expect((response) =>
        expect(
          body<{ data: { financials: { received: string } } }>(response).data.financials.received,
        ).toBe('0'),
      );
    await agentB
      .get(`/api/v1/payments?quotation=${quotationA}`)
      .expect(200)
      .expect((response) => expect(body<{ data: unknown[] }>(response).data).toHaveLength(0));
  });

  it('keeps Viewer commercial access read-only', async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId: orgA, name: 'Viewer' } },
    });
    const email = `${slugA}-viewer@example.test`;
    const hash = await app.get(PasswordService).hash(password);
    await prisma.user.create({
      data: {
        organizationId: orgA,
        firstName: 'View',
        lastName: 'Only',
        email,
        normalizedEmail: email,
        passwordHash: hash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: { roleId: role.id } },
      },
    });
    const viewer = request.agent(server);
    const csrf = csrfFrom(
      await viewer.post('/api/v1/auth/login').send({ email, password }).expect(200),
    );
    await viewer.get('/api/v1/quotations').expect(200);
    await viewer.get('/api/v1/payments').expect(200);
    await mutate(viewer, csrf, 'post', '/api/v1/quotations').send(quotationPayload()).expect(403);
    await mutate(viewer, csrf, 'post', '/api/v1/payments')
      .send({ companyId: companyA, amount: '1', currency: 'BDT', paymentDate: '2026-09-03' })
      .expect(403);
  });
});
