import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityBootstrapService } from '../src/bootstrap.service';
import { PrismaService } from '../src/database/prisma.service';
import { MailboxTransportService } from '../src/email/mailbox-transport.service';
import { IntegrationSecretService } from '../src/integrations/integration-secret.service';
import { JobsService } from '../src/jobs/jobs.service';
import {
  nextUidRange,
  normalizeReferences,
  safeMailboxError,
} from '../src/mailboxes/mailbox.helpers';
import { MailboxesService } from '../src/mailboxes/mailboxes.service';
import { RateLimitService } from '../src/auth/rate-limit.service';
import { PasswordService } from '../src/auth/password.service';
import { CrmEmailService } from '../src/email/crm-email.service';

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
  method: 'patch' | 'post',
  path: string,
) {
  return agent[method](path).set('origin', origin).set('x-csrf-token', csrf);
}

type FakeMessage = { uid: number; source: Buffer; internalDate: Date };

class FakeMailboxTransport {
  inbox: FakeMessage[] = [];
  sent: FakeMessage[] = [];
  failImap = false;
  failSmtp = false;
  deliveries: Array<{ messageId: string; inReplyTo?: string; references?: string[] }> = [];

  verifyImap() {
    if (this.failImap)
      return Promise.reject(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }));
    return Promise.resolve();
  }
  verifySmtp() {
    if (this.failSmtp)
      return Promise.reject(Object.assign(new Error('certificate rejected'), { code: 'CERT' }));
    return Promise.resolve();
  }
  createImapClient() {
    const inbox = this.inbox;
    const sent = this.sent;
    let folder = 'INBOX';
    return {
      isClosed: false,
      connect: () => Promise.resolve(),
      list: () => Promise.resolve([{ path: 'Sent', specialUse: '\\Sent' }]),
      mailboxOpen(path: string) {
        folder = path;
        const messages = path === 'INBOX' ? inbox : sent;
        return Promise.resolve({
          uidValidity: path === 'INBOX' ? 101n : 202n,
          exists: messages.length,
          uidNext: Math.max(0, ...messages.map((message) => message.uid)) + 1,
        });
      },
      *fetch(range: string | number | bigint) {
        const messages = folder === 'INBOX' ? inbox : sent;
        const first = Number(String(range).split(':')[0]);
        for (const message of messages.filter((item) => item.uid >= first))
          yield { ...message, size: message.source.length };
      },
      logout() {
        this.isClosed = true;
        return Promise.resolve();
      },
      close() {
        this.isClosed = true;
      },
    };
  }
  send(
    _mailbox: unknown,
    _credential: string,
    input: { messageId: string; inReplyTo?: string; references?: string[] },
  ) {
    this.deliveries.push(input);
    return Promise.resolve({ messageId: input.messageId });
  }
}

class TestJobsService {
  mailboxSyncs: string[] = [];
  crmEmails: string[] = [];
  enqueueMailboxSync(id: string) {
    this.mailboxSyncs.push(id);
    return Promise.resolve();
  }
  enqueueCrmEmail(id: string) {
    this.crmEmails.push(id);
    return Promise.resolve();
  }
  enqueueEmail() {
    return Promise.resolve();
  }
  enqueueIntegrationEvent() {
    return Promise.resolve();
  }
  enqueueWebhookDelivery() {
    return Promise.resolve();
  }
  enqueueAutomationRun() {
    return Promise.resolve();
  }
}

function rawMail(input: { from: string; messageId: string; subject: string; references?: string }) {
  return Buffer.from(
    [
      `Message-ID: ${input.messageId}`,
      ...(input.references
        ? [`In-Reply-To: ${input.references}`, `References: ${input.references}`]
        : []),
      `From: Customer <${input.from}>`,
      'To: sales@example.test',
      `Subject: ${input.subject}`,
      'Date: Wed, 10 Sep 2026 12:00:00 +0000',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Mailbox integration test body.',
    ].join('\r\n'),
  );
}

describe('Milestone 14 mailbox integration', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let mailboxes: MailboxesService;
  let crmEmail: CrmEmailService;
  let transport: FakeMailboxTransport;
  let jobs: TestJobsService;
  let orgA: string;
  let orgB: string;
  let ownerA: string;
  let mailboxId: string;
  let contactId: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let csrfA: string;
  let csrfB: string;
  let slugA: string;
  let slugB: string;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '100';
    process.env.CORS_ORIGINS = origin;
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 44).toString('base64');
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JobsService)
      .useClass(TestJobsService)
      .overrideProvider(MailboxTransportService)
      .useClass(FakeMailboxTransport)
      .overrideProvider(RateLimitService)
      .useValue({ consume: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    mailboxes = app.get(MailboxesService);
    crmEmail = app.get(CrmEmailService);
    transport = app.get<FakeMailboxTransport>(MailboxTransportService);
    jobs = app.get<TestJobsService>(JobsService);
    slugA = `m14-a-${crypto.randomUUID()}`;
    slugB = `m14-b-${crypto.randomUUID()}`;
    const bootstrap = app.get(IdentityBootstrapService);
    for (const [slug, suffix] of [
      [slugA, 'A'],
      [slugB, 'B'],
    ] as const)
      await bootstrap.run({
        organizationName: `Milestone 14 ${suffix}`,
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
    const organizationB = await prisma.organization.findUniqueOrThrow({ where: { slug: slugB } });
    orgA = organizationA.id;
    orgB = organizationB.id;
    ownerA = organizationA.users[0]!.id;
    const company = await prisma.company.create({
      data: { organizationId: orgA, name: 'Mail Customer', createdById: ownerA },
    });
    contactId = (
      await prisma.contact.create({
        data: {
          organizationId: orgA,
          companyId: company.id,
          firstName: 'Mail',
          lastName: 'Customer',
          email: 'customer@example.test',
          normalizedEmail: 'customer@example.test',
          createdById: ownerA,
        },
      })
    ).id;
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

  it('encrypts and redacts credentials while enforcing tenant and management permissions', async () => {
    const created = body<{
      data: { id: string; credential?: string; encryptedCredential?: string };
    }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/mailboxes')
        .send({
          name: 'Sales',
          emailAddress: 'sales@example.test',
          displayName: 'Sales Team',
          imapHost: 'imap.example.test',
          imapPort: 993,
          imapSecure: true,
          smtpHost: 'smtp.example.test',
          smtpPort: 465,
          smtpSecure: true,
          username: 'sales@example.test',
          credential: 'test-mailbox-app-password',
        })
        .expect(201),
    ).data;
    mailboxId = created.id;
    expect(created.credential).toBeUndefined();
    expect(created.encryptedCredential).toBeUndefined();
    const stored = await prisma.mailboxConnection.findUniqueOrThrow({ where: { id: mailboxId } });
    expect(stored.encryptedCredential).not.toContain('test-mailbox-app-password');
    expect(app.get(IntegrationSecretService).decrypt(stored.encryptedCredential)).toBe(
      'test-mailbox-app-password',
    );
    expect(
      body<{ data: unknown[] }>(await agentB.get('/api/v1/mailboxes').expect(200)).data,
    ).toHaveLength(0);
    await mutate(agentB, csrfB, 'patch', `/api/v1/mailboxes/${mailboxId}`)
      .send({ enabled: false })
      .expect(404);
    const viewer = await createUser('Viewer');
    const viewerSession = await login(viewer.email);
    await mutate(viewerSession.agent, viewerSession.csrf, 'post', '/api/v1/mailboxes')
      .send({})
      .expect(403);
  });

  it('validates IMAP and SMTP connections and stores only safe failure summaries', async () => {
    await mutate(agentA, csrfA, 'post', `/api/v1/mailboxes/${mailboxId}/test-imap`).expect(201);
    await mutate(agentA, csrfA, 'post', `/api/v1/mailboxes/${mailboxId}/test-smtp`).expect(201);
    transport.failImap = true;
    await mutate(agentA, csrfA, 'post', `/api/v1/mailboxes/${mailboxId}/test-imap`).expect(503);
    expect(
      (await prisma.mailboxConnection.findUniqueOrThrow({ where: { id: mailboxId } }))
        .safeErrorSummary,
    ).toBe('Authentication failed');
    transport.failImap = false;
  });

  it('increments IMAP UIDs, creates threads, matches Contacts, and prevents duplicates', async () => {
    transport.inbox = [
      {
        uid: 1,
        source: rawMail({
          from: 'customer@example.test',
          messageId: '<inbound-1@example.test>',
          subject: 'Proposal reply',
        }),
        internalDate: new Date(),
      },
    ];
    await expect(mailboxes.syncMailbox(mailboxId)).resolves.toMatchObject({ messages: 1 });
    const inbound = await prisma.emailMessage.findFirstOrThrow({
      where: { mailboxConnectionId: mailboxId, externalMessageId: '<inbound-1@example.test>' },
    });
    expect(inbound).toMatchObject({
      direction: 'INBOUND',
      relatedEntityType: 'CONTACT',
      relatedEntityId: contactId,
      status: 'SENT',
    });
    expect(inbound.threadId).toBeTruthy();
    await expect(mailboxes.syncMailbox(mailboxId)).resolves.toMatchObject({ messages: 0 });
    expect(
      await prisma.emailMessage.count({
        where: { mailboxConnectionId: mailboxId, externalMessageId: '<inbound-1@example.test>' },
      }),
    ).toBe(1);
    const state = (await prisma.mailboxConnection.findUniqueOrThrow({ where: { id: mailboxId } }))
      .syncState as { folders: { INBOX: { lastUid: number } } };
    expect(state.folders.INBOX.lastUid).toBe(1);
  });

  it('threads replies, sends through the selected mailbox, and deduplicates Sent sync', async () => {
    const inbound = await prisma.emailMessage.findFirstOrThrow({
      where: { mailboxConnectionId: mailboxId, externalMessageId: '<inbound-1@example.test>' },
    });
    const otherMailbox = body<{ data: { id: string } }>(
      await mutate(agentA, csrfA, 'post', '/api/v1/mailboxes')
        .send({
          name: 'Support',
          emailAddress: 'support@example.test',
          imapHost: 'imap.example.test',
          imapPort: 993,
          imapSecure: true,
          smtpHost: 'smtp.example.test',
          smtpPort: 465,
          smtpSecure: true,
          username: 'support@example.test',
          credential: 'test-support-app-password',
        })
        .expect(201),
    ).data;
    await mutate(agentA, csrfA, 'post', `/api/v1/mail/threads/${inbound.threadId}/reply`)
      .send({
        mailboxConnectionId: otherMailbox.id,
        subject: 'Re: Proposal reply',
        body: 'This must not be sent from another mailbox.',
      })
      .expect(400);
    const queued = body<{ data: { id: string; externalMessageId: string } }>(
      await mutate(agentA, csrfA, 'post', `/api/v1/mail/threads/${inbound.threadId}/reply`)
        .send({
          mailboxConnectionId: mailboxId,
          subject: 'Re: Proposal reply',
          body: 'Thank you for the reply.',
        })
        .expect(201),
    ).data;
    expect(jobs.crmEmails).toContain(queued.id);
    await crmEmail.processDelivery(queued.id, 0, 3);
    expect(transport.deliveries[0]).toMatchObject({
      messageId: queued.externalMessageId,
      inReplyTo: '<inbound-1@example.test>',
    });
    transport.sent = [
      {
        uid: 1,
        source: rawMail({
          from: 'sales@example.test',
          messageId: queued.externalMessageId,
          subject: 'Re: Proposal reply',
          references: '<inbound-1@example.test>',
        }),
        internalDate: new Date(),
      },
    ];
    await mailboxes.syncMailbox(mailboxId);
    expect(
      await prisma.emailMessage.count({
        where: { mailboxConnectionId: mailboxId, externalMessageId: queued.externalMessageId },
      }),
    ).toBe(1);
  });

  it('matches Leads, leaves ambiguous inbound email unmatched, and links tenant-safely', async () => {
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: orgA },
      include: { stages: true },
    });
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgA,
        title: 'Unique mailbox lead',
        email: 'lead-match@example.test',
        normalizedEmail: 'lead-match@example.test',
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        createdById: ownerA,
      },
    });
    transport.inbox.push({
      uid: 2,
      source: rawMail({
        from: 'lead-match@example.test',
        messageId: '<lead-match@example.test>',
        subject: 'Lead reply',
      }),
      internalDate: new Date(),
    });
    await mailboxes.syncMailbox(mailboxId);
    expect(
      await prisma.emailMessage.findFirstOrThrow({
        where: { mailboxConnectionId: mailboxId, externalMessageId: '<lead-match@example.test>' },
      }),
    ).toMatchObject({ relatedEntityType: 'LEAD', relatedEntityId: lead.id });
    await prisma.lead.createMany({
      data: [1, 2].map((number) => ({
        organizationId: orgA,
        title: `Ambiguous ${number}`,
        email: 'ambiguous@example.test',
        normalizedEmail: 'ambiguous@example.test',
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        createdById: ownerA,
      })),
    });
    transport.inbox.push({
      uid: 3,
      source: rawMail({
        from: 'ambiguous@example.test',
        messageId: '<ambiguous@example.test>',
        subject: 'Unknown sender',
      }),
      internalDate: new Date(),
    });
    await mailboxes.syncMailbox(mailboxId);
    const message = await prisma.emailMessage.findFirstOrThrow({
      where: { mailboxConnectionId: mailboxId, externalMessageId: '<ambiguous@example.test>' },
    });
    expect(message.relatedEntityId).toBeNull();
    const foreignCompany = await prisma.company.create({
      data: { organizationId: orgB, name: 'Foreign company' },
    });
    await mutate(agentA, csrfA, 'post', `/api/v1/mail/threads/${message.threadId}/link`)
      .send({ relatedEntityType: 'COMPANY', relatedEntityId: foreignCompany.id })
      .expect(404);
    await mutate(agentA, csrfA, 'post', `/api/v1/mail/threads/${message.threadId}/link`)
      .send({ relatedEntityType: 'CONTACT', relatedEntityId: contactId })
      .expect(201);
    expect(
      (await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } })).relatedEntityId,
    ).toBe(contactId);
  });

  it('queues recovery jobs and prevents disabled mailbox synchronization', async () => {
    const recovered = await mailboxes.recoverMailboxes();
    expect(recovered.mailboxes).toBeGreaterThan(0);
    expect(jobs.mailboxSyncs).toContain(mailboxId);
    await mutate(agentA, csrfA, 'patch', `/api/v1/mailboxes/${mailboxId}`)
      .send({ enabled: false })
      .expect(200);
    await expect(mailboxes.syncMailbox(mailboxId)).resolves.toMatchObject({ skipped: true });
  });

  it('keeps UID reset, threading header, and safe-error helpers deterministic', () => {
    expect(
      nextUidRange({
        currentUidValidity: '2',
        exists: 500,
        uidNext: 10_001,
        previous: { uidValidity: '1', lastUid: 450 },
        batchSize: 100,
      }),
    ).toBe('9901:*');
    expect(normalizeReferences({ references: ['<a@test>'], inReplyTo: '<b@test>' })).toEqual([
      '<a@test>',
      '<b@test>',
    ]);
    expect(safeMailboxError(new Error('password=secret authentication rejected'))).toBe(
      'Authentication failed',
    );
  });

  async function createUser(roleName: 'Viewer') {
    const role = await prisma.role.findFirstOrThrow({
      where: { organizationId: orgA, name: roleName },
    });
    const email = `${roleName.toLowerCase()}-${crypto.randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        organizationId: orgA,
        firstName: roleName,
        lastName: 'User',
        email,
        normalizedEmail: email,
        passwordHash: await app.get(PasswordService).hash(password),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: { roleId: role.id } },
      },
    });
    return user;
  }
  async function login(email: string) {
    const agent = request.agent(server);
    const response = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
    return { agent, csrf: csrfFrom(response) };
  }
});
