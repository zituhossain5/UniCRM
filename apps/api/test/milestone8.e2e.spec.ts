import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe('Milestone 8 generic CRM flexibility', () => {
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
  let companyA: string;

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
    slugA = `m8-a-${crypto.randomUUID()}`;
    slugB = `m8-b-${crypto.randomUUID()}`;
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, suffix] of [
      [slugA, 'A'],
      [slugB, 'B'],
    ] as const)
      await bootstrap.run({
        organizationName: `Milestone 8 ${suffix}`,
        organizationSlug: slug,
        adminEmail: `${slug}@example.test`,
        adminPassword: password,
        adminFirstName: 'Owner',
        adminLastName: suffix,
      });
    orgA = (await prisma.organization.findUniqueOrThrow({ where: { slug: slugA } })).id;
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

  it('validates required, typed, select, and tenant-isolated custom fields without schema changes', async () => {
    const required = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/custom-fields')
        .send({
          entityType: 'COMPANY',
          name: 'Customer code',
          key: 'customer_code',
          fieldType: 'TEXT',
          required: true,
        })
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'post', '/api/v1/custom-fields')
      .send({
        entityType: 'COMPANY',
        name: 'Segment',
        key: 'segment',
        fieldType: 'SELECT',
        options: ['Enterprise', 'Retainer'],
      })
      .expect(201);
    for (const definition of [
      { name: 'Notes', key: 'notes', fieldType: 'LONG_TEXT' },
      { name: 'Seats', key: 'seats', fieldType: 'NUMBER' },
      { name: 'Budget', key: 'budget', fieldType: 'CURRENCY' },
      { name: 'Renewal', key: 'renewal', fieldType: 'DATE' },
      { name: 'Partner', key: 'partner', fieldType: 'BOOLEAN' },
      {
        name: 'Regions',
        key: 'regions',
        fieldType: 'MULTI_SELECT',
        options: ['Dhaka', 'Chattogram'],
      },
      { name: 'Portal', key: 'portal', fieldType: 'URL' },
      { name: 'Billing email', key: 'billing_email', fieldType: 'EMAIL' },
      { name: 'Hotline', key: 'hotline', fieldType: 'PHONE' },
    ])
      await mutate(agentA, csrfA, 'post', '/api/v1/custom-fields')
        .send({ entityType: 'COMPANY', ...definition })
        .expect(201);
    const definitions = body<{ data: Array<{ id: string; position: number }> }>(
      await agentA.get('/api/v1/custom-fields?entityType=COMPANY').expect(200),
    ).data;
    await mutate(agentA, csrfA, 'post', '/api/v1/custom-fields/reorder/COMPANY')
      .send({
        fields: definitions.map(({ id }, position) => ({ id, position: position * 2 })),
      })
      .expect(400);
    await mutate(agentA, csrfA, 'post', '/api/v1/custom-fields/reorder/COMPANY')
      .send({
        fields: [...definitions].reverse().map(({ id }, position) => ({ id, position })),
      })
      .expect(201);
    await mutate(agentA, csrfA, 'post', '/api/v1/companies')
      .send({ name: 'Missing field' })
      .expect(400);
    await mutate(agentA, csrfA, 'post', '/api/v1/companies')
      .send({ name: 'Invalid select', customFields: { customer_code: 'ACME', segment: 'Unknown' } })
      .expect(400);
    const created = await mutate(agentA, csrfA, 'post', '/api/v1/companies')
      .send({
        name: 'Acme Services',
        customFields: { customer_code: 'ACME-1', segment: 'Enterprise' },
      })
      .expect(201);
    companyA = body<{
      data: { id: string; customFields: Array<{ definition: { key: string }; value: unknown }> };
    }>(created).data.id;
    const fields = body<{
      data: { customFields: Array<{ definition: { key: string }; value: unknown }> };
    }>(created).data.customFields;
    expect(fields.find(({ definition }) => definition.key === 'customer_code')?.value).toBe(
      'ACME-1',
    );
    for (const customFields of [
      { seats: 'many' },
      { budget: 'unknown' },
      { renewal: '2026-02-30' },
      { partner: 'true' },
      { regions: ['Dhaka', 'Unknown'] },
      { portal: 'example.test' },
      { billing_email: 'not-an-email' },
      { hotline: 'call-us' },
    ])
      await mutate(agentA, csrfA, 'patch', `/api/v1/companies/${companyA}`)
        .send({ customFields })
        .expect(400);
    await mutate(agentA, csrfA, 'patch', `/api/v1/companies/${companyA}`)
      .send({
        customFields: {
          notes: 'Renewal account',
          seats: 125,
          budget: 500000,
          renewal: '2026-09-30',
          partner: true,
          regions: ['Dhaka', 'Chattogram'],
          portal: 'https://example.test',
          billing_email: 'billing@example.test',
          hotline: '+880 1700-000000',
        },
      })
      .expect(200);
    const filteredByCustomField = body<{ data: Array<{ id: string }> }>(
      await agentA
        .get(
          `/api/v1/companies?customFields=${encodeURIComponent(JSON.stringify({ segment: 'Enterprise' }))}`,
        )
        .expect(200),
    );
    expect(filteredByCustomField.data.map(({ id }) => id)).toContain(companyA);
    await mutate(agentA, csrfA, 'patch', `/api/v1/custom-fields/${required.id}`)
      .send({ active: false })
      .expect(200);
    expect(
      await prisma.customFieldValue.count({
        where: { organizationId: orgA, fieldDefinitionId: required.id },
      }),
    ).toBe(1);
    expect(
      body<{ data: unknown[] }>(
        await agentB.get('/api/v1/custom-fields?entityType=COMPANY').expect(200),
      ).data,
    ).toHaveLength(0);
    await mutate(agentB, csrfB, 'patch', `/api/v1/custom-fields/${required.id}`)
      .send({ name: 'Cross tenant' })
      .expect(404);
  });

  it('normalizes custom field keys and updates existing leads through the canonical payload shape', async () => {
    const existingLead = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/leads')
        .send({ title: 'Existing lead before custom fields' })
        .expect(201),
    ).data;
    const definition = body<{ data: { id: string; key: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/custom-fields')
        .send({
          entityType: 'LEAD',
          name: 'Budget Type',
          key: 'Budget Type',
          fieldType: 'SELECT',
          options: ['Fixed', 'Variable'],
        })
        .expect(201),
    ).data;
    expect(definition.key).toBe('budget_type');
    await mutate(agentA, csrfA, 'post', '/api/v1/custom-fields')
      .send({
        entityType: 'LEAD',
        name: 'Duplicate budget type',
        key: 'budget_type',
        fieldType: 'TEXT',
      })
      .expect(409);
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${existingLead.id}`)
      .send({ 'customField:budget_type': 'Fixed' })
      .expect(400);
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${existingLead.id}`)
      .send({ title: 'Existing lead still editable' })
      .expect(200);
    const updated = body<{
      data: { customFields: Array<{ definition: { key: string }; value: unknown }> };
    }>(
      await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${existingLead.id}`)
        .send({ customFields: { budget_type: 'Fixed' } })
        .expect(200),
    ).data;
    expect(
      updated.customFields.find(({ definition }) => definition.key === 'budget_type')?.value,
    ).toBe('Fixed');
    const refreshed = body<{
      data: { customFields: Array<{ definition: { key: string }; value: unknown }> };
    }>(await agentA.get(`/api/v1/leads/${existingLead.id}`).expect(200)).data;
    expect(
      refreshed.customFields.find(({ definition: item }) => item.key === 'budget_type')?.value,
    ).toBe('Fixed');
  });

  it('creates, attaches, removes, filters, and isolates reusable tags', async () => {
    const tagA = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/tags').send({ name: 'Enterprise' }).expect(201),
    ).data;
    const tagB = body<{ data: { id: string } }>(
      await mutate(agentB, csrfB, 'post', '/api/v1/tags')
        .send({ name: 'Other tenant' })
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'post', '/api/v1/tags').send({ name: ' enterprise ' }).expect(409);
    await mutate(agentA, csrfA, 'post', `/api/v1/tags/${tagA.id}/records`)
      .send({ entityType: 'COMPANY', entityId: companyA })
      .expect(201);
    const filtered = body<{ data: Array<{ id: string; tags: Array<{ id: string }> }> }>(
      await agentA.get(`/api/v1/companies?tag=${tagA.id}`).expect(200),
    );
    expect(filtered.data).toEqual([
      expect.objectContaining({ id: companyA, tags: [expect.objectContaining({ id: tagA.id })] }),
    ]);
    await mutate(agentA, csrfA, 'post', `/api/v1/tags/${tagB.id}/records`)
      .send({ entityType: 'COMPANY', entityId: companyA })
      .expect(404);
    await mutate(agentA, csrfA, 'delete', `/api/v1/tags/${tagA.id}/records`)
      .send({ entityType: 'COMPANY', entityId: companyA })
      .expect(204);
    expect(
      body<{ data: unknown[] }>(await agentA.get(`/api/v1/companies?tag=${tagA.id}`).expect(200))
        .data,
    ).toHaveLength(0);
  });

  it('supports custom pipelines, stage ordering, pipeline changes, terminal behavior, and isolation', async () => {
    const pipeline = body<{ data: { id: string; stages: Array<{ id: string; name: string }> } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/pipelines')
        .send({
          name: 'Partnerships',
          stages: [
            { name: 'Introduced', position: 0, isWon: false, isLost: false },
            { name: 'Partnered', position: 1, isWon: true, isLost: false },
            { name: 'Declined', position: 2, isWon: false, isLost: true },
          ],
        })
        .expect(201),
    ).data;
    const introduced = pipeline.stages.find(({ name }) => name === 'Introduced')!;
    const partnered = pipeline.stages.find(({ name }) => name === 'Partnered')!;
    const lead = body<{ data: { id: string; pipelineId: string; stageId: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/leads')
        .send({ title: 'Partner lead', pipelineId: pipeline.id, stageId: introduced.id })
        .expect(201),
    ).data;
    expect(lead).toMatchObject({ pipelineId: pipeline.id, stageId: introduced.id });
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${lead.id}/stage`)
      .send({ pipelineId: pipeline.id, stageId: partnered.id })
      .expect(200);
    const second = body<{ data: { id: string; stages: Array<{ id: string }> } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/pipelines')
        .send({
          name: 'Wholesale',
          stages: [
            { name: 'New', position: 0, isWon: false, isLost: false },
            { name: 'Won', position: 1, isWon: true, isLost: false },
            { name: 'Lost', position: 2, isWon: false, isLost: true },
          ],
        })
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${lead.id}/stage`)
      .send({ pipelineId: second.id, stageId: second.stages[0]!.id })
      .expect(200);
    await mutate(agentA, csrfA, 'put', `/api/v1/pipelines/${second.id}/stages`)
      .send({
        stages: [
          { id: second.stages[1]!.id, name: 'Won', position: 0, isWon: true, isLost: false },
          { id: second.stages[2]!.id, name: 'Lost', position: 1, isWon: false, isLost: true },
        ],
      })
      .expect(409);
    await mutate(agentA, csrfA, 'delete', `/api/v1/pipelines/${second.id}`).expect(409);
    await mutate(agentA, csrfA, 'put', `/api/v1/pipelines/${second.id}/stages`)
      .send({
        stages: [
          { id: second.stages[2]!.id, name: 'Lost', position: 0, isWon: false, isLost: true },
          { id: second.stages[0]!.id, name: 'New', position: 1, isWon: false, isLost: false },
          { id: second.stages[1]!.id, name: 'Won', position: 2, isWon: true, isLost: false },
        ],
      })
      .expect(200);
    const foreign = body<{ data: Array<{ id: string }> }>(
      await agentB.get('/api/v1/pipelines').expect(200),
    ).data[0]!;
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${lead.id}/stage`)
      .send({ pipelineId: foreign.id, stageId: crypto.randomUUID() })
      .expect(400);
    expect(
      await prisma.leadActivity.count({
        where: { organizationId: orgA, leadId: lead.id, type: 'STATUS_CHANGE' },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('creates, applies, updates, deletes, validates, and isolates private and organization views', async () => {
    await mutate(agentA, csrfA, 'post', '/api/v1/saved-views')
      .send({
        entityType: 'LEAD',
        name: 'Unsafe',
        filters: { rawSql: 'DROP TABLE leads' },
        visibility: 'PRIVATE',
      })
      .expect(400);
    const privateView = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/saved-views')
        .send({
          entityType: 'LEAD',
          name: 'My partnerships',
          filters: {
            pipeline: (
              await prisma.pipeline.findFirstOrThrow({
                where: { organizationId: orgA, name: 'Partnerships' },
              })
            ).id,
          },
          sort: { field: 'title', order: 'asc' },
          columns: ['title', 'stage', 'tags'],
          visibility: 'PRIVATE',
          isDefault: true,
        })
        .expect(201),
    ).data;
    const orgView = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/saved-views')
        .send({
          entityType: 'COMPANY',
          name: 'Enterprise accounts',
          filters: { customFields: { segment: 'Enterprise' } },
          sort: { field: 'name', order: 'asc' },
          visibility: 'ORGANIZATION',
        })
        .expect(201),
    ).data;
    expect(
      body<{ data: Array<{ id: string }> }>(
        await agentA.get('/api/v1/saved-views?entityType=LEAD').expect(200),
      ).data.map(({ id }) => id),
    ).toContain(privateView.id);
    expect(
      body<{ data: Array<{ id: string }> }>(
        await agentB.get('/api/v1/saved-views?entityType=LEAD').expect(200),
      ).data.map(({ id }) => id),
    ).not.toContain(privateView.id);
    await mutate(agentA, csrfA, 'patch', `/api/v1/saved-views/${privateView.id}`)
      .send({ name: 'Partnership pipeline', filters: { view: 'all' } })
      .expect(200);
    await mutate(agentB, csrfB, 'patch', `/api/v1/saved-views/${orgView.id}`)
      .send({ name: 'Cross tenant edit' })
      .expect(404);
    await mutate(agentA, csrfA, 'delete', `/api/v1/saved-views/${privateView.id}`).expect(204);
  });
});
