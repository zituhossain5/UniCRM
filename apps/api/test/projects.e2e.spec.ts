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
const password = 'Projects-owner-password-2026!';

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
  method: 'delete' | 'patch' | 'post',
  path: string,
) {
  return agent[method](path).set('origin', origin).set('x-csrf-token', csrf);
}

describe('Milestone 4 projects and tasks', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let orgA: string;
  let orgB: string;
  let ownerA: string;
  let ownerB: string;
  let companyA: string;
  let companyB: string;
  let leadA: string;
  let projectA: string;
  let taskA: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let csrfA: string;
  let csrfB: string;
  const slugA = `projects-a-${crypto.randomUUID()}`;
  const slugB = `projects-b-${crypto.randomUUID()}`;

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
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, label] of [
      [slugA, 'Projects A'],
      [slugB, 'Projects B'],
    ] as const) {
      await bootstrap.run({
        organizationName: label,
        organizationSlug: slug,
        adminEmail: `${slug}@example.test`,
        adminPassword: password,
        adminFirstName: 'Owner',
        adminLastName: label.at(-1)!,
      });
    }
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
    const lead = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/leads')
        .send({
          title: 'Corporate Website Redesign',
          companyId: companyA,
          estimatedValue: '120000',
          currency: 'BDT',
        })
        .expect(201),
    ).data;
    leadA = lead.id;
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgA },
      include: { stages: true },
    });
    const won = pipeline.stages.find((stage) => stage.isWon)!;
    await mutate(agentA, csrfA, 'patch', `/api/v1/leads/${leadA}/stage`)
      .send({ stageId: won.id })
      .expect(200);
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      for (const organizationId of [orgA, orgB].filter(Boolean)) {
        await prisma.activityLog.deleteMany({ where: { organizationId } });
        await prisma.attachment.deleteMany({ where: { organizationId } });
        await prisma.taskComment.deleteMany({ where: { organizationId } });
        await prisma.task.deleteMany({ where: { organizationId } });
        await prisma.projectMember.deleteMany({ where: { organizationId } });
        await prisma.project.deleteMany({ where: { organizationId } });
        await prisma.followUp.deleteMany({ where: { organizationId } });
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

  it('creates a project from a won lead once and enforces tenant relationships', async () => {
    const created = await mutate(agentA, csrfA, 'post', '/api/v1/projects')
      .send({
        name: 'Corporate Website Redesign',
        companyId: companyA,
        sourceLeadId: leadA,
        projectManagerId: ownerA,
        projectValue: '120000',
        currency: 'BDT',
        priority: 'HIGH',
        startDate: '2026-09-02',
        deadline: '2026-09-30',
      })
      .expect(201);
    projectA = body<{ data: { id: string; members: unknown[] } }>(created).data.id;
    expect(body<{ data: { members: unknown[] } }>(created).data.members).toHaveLength(1);
    await mutate(agentA, csrfA, 'post', '/api/v1/projects')
      .send({ name: 'Duplicate', companyId: companyA, sourceLeadId: leadA })
      .expect(409);
    await mutate(agentA, csrfA, 'post', '/api/v1/projects')
      .send({ name: 'Cross company', companyId: companyB })
      .expect(404);
    await mutate(agentA, csrfA, 'patch', `/api/v1/projects/${projectA}`)
      .send({ projectManagerId: ownerB })
      .expect(404);
    await mutate(agentA, csrfA, 'patch', `/api/v1/projects/${projectA}`)
      .send({ status: 'IN_PROGRESS', progress: 45, projectValue: '125000', currency: 'BDT' })
      .expect(200);
    const list = body<{ data: Array<{ id: string }> }>(
      await agentA
        .get(
          '/api/v1/projects?status=IN_PROGRESS&priority=HIGH&search=Corporate&deadline=2026-09-30&sort=name&order=asc',
        )
        .expect(200),
    );
    expect(list.data.map((project) => project.id)).toContain(projectA);
    await agentB.get(`/api/v1/projects/${projectA}`).expect(404);
    expect(
      body<{ data: { project: { id: string } } }>(
        await agentA.get(`/api/v1/leads/${leadA}`).expect(200),
      ).data.project.id,
    ).toBe(projectA);
  });

  it('manages members and rejects duplicate and cross-tenant membership', async () => {
    const member = await createRoleUser('Staff');
    await mutate(agentA, csrfA, 'post', `/api/v1/projects/${projectA}/members`)
      .send({ userId: member.id, role: 'Developer' })
      .expect(201);
    await mutate(agentA, csrfA, 'post', `/api/v1/projects/${projectA}/members`)
      .send({ userId: member.id })
      .expect(409);
    await mutate(agentA, csrfA, 'post', `/api/v1/projects/${projectA}/members`)
      .send({ userId: ownerB })
      .expect(404);
    await mutate(agentA, csrfA, 'patch', `/api/v1/projects/${projectA}`)
      .send({ projectManagerId: member.id })
      .expect(200);
    await mutate(
      agentA,
      csrfA,
      'delete',
      `/api/v1/projects/${projectA}/members/${member.id}`,
    ).expect(409);
    await mutate(agentA, csrfA, 'patch', `/api/v1/projects/${projectA}`)
      .send({ projectManagerId: ownerA })
      .expect(200);
    await mutate(
      agentA,
      csrfA,
      'delete',
      `/api/v1/projects/${projectA}/members/${member.id}`,
    ).expect(204);
  });

  it('creates, filters, assigns, completes, and isolates tasks', async () => {
    const overdue = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const created = await mutate(agentA, csrfA, 'post', '/api/v1/tasks')
      .send({
        projectId: projectA,
        title: 'Create homepage UI',
        assigneeId: ownerA,
        priority: 'HIGH',
        dueDate: today,
      })
      .expect(201);
    taskA = body<{ data: { id: string } }>(created).data.id;
    await mutate(agentA, csrfA, 'post', '/api/v1/tasks')
      .send({ projectId: projectA, title: 'Implement contact form API', dueDate: overdue })
      .expect(201);
    await mutate(agentA, csrfA, 'post', '/api/v1/tasks')
      .send({ projectId: projectA, title: 'Bad assignee', assigneeId: ownerB })
      .expect(404);
    expect(
      body<{ data: Array<{ id: string }> }>(
        await agentA
          .get(
            `/api/v1/tasks?view=dueToday&project=${projectA}&assignee=${ownerA}&dueDate=${today}&sort=dueDate&order=asc`,
          )
          .expect(200),
      ).data.map((task) => task.id),
    ).toContain(taskA);
    expect(
      body<{ data: Array<{ title: string }> }>(
        await agentA.get('/api/v1/tasks?view=overdue').expect(200),
      ).data.map((task) => task.title),
    ).toContain('Implement contact form API');
    await mutate(agentA, csrfA, 'patch', `/api/v1/tasks/${taskA}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    await mutate(agentA, csrfA, 'patch', `/api/v1/tasks/${taskA}`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: taskA } })).completedAt,
    ).not.toBeNull();
    expect(
      await prisma.activityLog.count({
        where: { entityId: projectA, action: 'PROJECT_TASK_COMPLETED' },
      }),
    ).toBe(1);
    await agentB.get(`/api/v1/tasks/${taskA}`).expect(404);
    await mutate(agentB, csrfB, 'post', '/api/v1/tasks')
      .send({ projectId: projectA, title: 'Cross tenant task' })
      .expect(404);
  });

  it('supports comments and secure project/task attachments', async () => {
    const comment = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/tasks/${taskA}/comments`)
        .send({ content: 'Updated the API and started frontend integration.' })
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'patch', `/api/v1/tasks/${taskA}/comments/${comment.id}`)
      .send({ content: 'Updated API and frontend integration.' })
      .expect(200);
    expect(
      body<{ data: unknown[] }>(await agentA.get(`/api/v1/tasks/${taskA}/comments`).expect(200))
        .data,
    ).toHaveLength(1);
    await agentB.get(`/api/v1/tasks/${taskA}/comments`).expect(404);
    const uploaded = await mutate(agentA, csrfA, 'post', `/api/v1/projects/${projectA}/attachments`)
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'brief.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const attachmentId = body<{ data: { id: string } }>(uploaded).data.id;
    await agentA
      .get(`/api/v1/attachments/${attachmentId}/download`)
      .expect(200)
      .expect('content-type', /application\/pdf/);
    await agentB.get(`/api/v1/attachments/${attachmentId}/download`).expect(404);
    await mutate(agentA, csrfA, 'post', `/api/v1/tasks/${taskA}/attachments`)
      .attach('file', Buffer.from('MZ executable'), {
        filename: 'unsafe.exe',
        contentType: 'application/octet-stream',
      })
      .expect(400);
    await mutate(agentA, csrfA, 'delete', `/api/v1/attachments/${attachmentId}`).expect(204);
    await mutate(agentA, csrfA, 'delete', `/api/v1/tasks/${taskA}/comments/${comment.id}`).expect(
      204,
    );
  });

  it('keeps Viewer read-only and Staff within the established permission matrix', async () => {
    const viewer = await createRoleUser('Viewer');
    const staff = await createRoleUser('Staff');
    const viewerSession = await login(viewer.email);
    const staffSession = await login(staff.email);
    await viewerSession.agent.get('/api/v1/projects').expect(200);
    await viewerSession.agent.get('/api/v1/tasks').expect(200);
    await mutate(viewerSession.agent, viewerSession.csrf, 'post', '/api/v1/projects')
      .send({ name: 'Forbidden', companyId: companyA })
      .expect(403);
    await mutate(viewerSession.agent, viewerSession.csrf, 'post', '/api/v1/tasks')
      .send({ title: 'Forbidden', projectId: projectA })
      .expect(403);
    await mutate(staffSession.agent, staffSession.csrf, 'post', '/api/v1/tasks')
      .send({ title: 'Staff task', projectId: projectA })
      .expect(201);
    await mutate(
      staffSession.agent,
      staffSession.csrf,
      'delete',
      `/api/v1/projects/${projectA}`,
    ).expect(403);
    await mutate(
      staffSession.agent,
      staffSession.csrf,
      'post',
      `/api/v1/projects/${projectA}/members`,
    )
      .send({ userId: staff.id })
      .expect(403);
  });

  async function createRoleUser(roleName: 'Staff' | 'Viewer') {
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
