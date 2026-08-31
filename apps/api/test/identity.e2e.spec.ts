import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { plainToInstance } from 'class-transformer';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { LoginDto } from '../src/auth/dto/auth.dto';

const origin = 'http://localhost:3000';
const ownerPassword = 'Owner-password-2026!';
const nextPassword = 'Owner-password-2027!';

function csrfFrom(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith('unicrm_csrf='));
  if (!cookie) throw new Error('CSRF cookie was not set');
  return decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
}

function responseBody<T>(response: request.Response): T {
  const value: unknown = response.body;
  return value as T;
}

describe('Milestone 2 identity and access', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let slug: string;
  let ownerEmail: string;
  let ownerId: string;
  let ownerCsrf: string;
  let ownerAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '100';
    process.env.DEV_EMAIL_KEY = 'test-development-email-key';
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    const { IdentityBootstrapService } = await import('../src/bootstrap.service');
    slug = `identity-test-${crypto.randomUUID()}`;
    ownerEmail = `${slug}@example.test`;
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
    await app.get(IdentityBootstrapService).run({
      organizationName: 'Identity Test Organization',
      organizationSlug: slug,
      adminEmail: ownerEmail,
      adminPassword: ownerPassword,
      adminFirstName: 'Test',
      adminLastName: 'Owner',
    });
    ownerId = (await prisma.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } })).id;
  }, 30_000);

  afterAll(async () => {
    await prisma?.organization.deleteMany({ where: { slug: { startsWith: 'identity-test-' } } });
    await app?.close();
  }, 30_000);

  it('returns the same safe error for an unknown email and a wrong password', async () => {
    expect(plainToInstance(LoginDto, { email: ownerEmail.toUpperCase() }).email).toBe(ownerEmail);
    const unknown = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: `${crypto.randomUUID()}@example.test`, password: 'wrong' })
      .expect(401);
    const wrong = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password: 'wrong' })
      .expect(401);
    const unknownBody = responseBody<{ message: string }>(unknown);
    const wrongBody = responseBody<{ message: string }>(wrong);
    expect(unknownBody.message).toBe('Invalid email or password');
    expect(wrongBody.message).toBe(unknownBody.message);
  });

  it('rejects suspended and disabled accounts', async () => {
    for (const status of ['SUSPENDED', 'DISABLED'] as const) {
      await prisma.user.update({ where: { id: ownerId }, data: { status } });
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: ownerEmail, password: ownerPassword })
        .expect(401);
    }
    await prisma.user.update({ where: { id: ownerId }, data: { status: 'ACTIVE' } });
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    expect(await app.get(PasswordService).verify(owner.passwordHash!, ownerPassword)).toBe(true);
  });

  it('logs in with an HttpOnly opaque token while storing only hashes', async () => {
    ownerAgent = request.agent(server);
    const response = await ownerAgent
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(200);
    ownerCsrf = csrfFrom(response);
    const setCookies = response.headers['set-cookie'] as unknown as string[];
    expect(
      setCookies.some(
        (cookie) => cookie.startsWith('unicrm_session=') && cookie.includes('HttpOnly'),
      ),
    ).toBe(true);
    const rawSession = setCookies
      .find((cookie) => cookie.startsWith('unicrm_session='))!
      .split(';')[0]!
      .split('=')[1]!;
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId: ownerId },
      orderBy: { createdAt: 'desc' },
    });
    expect(session.tokenHash).not.toBe(rawSession);
    expect(session.csrfTokenHash).not.toBe(ownerCsrf);
    expect(responseBody<{ data: object }>(response).data).not.toHaveProperty('passwordHash');
  });

  it('requires CSRF validation for authenticated state changes', async () => {
    await ownerAgent.post('/api/v1/auth/logout-all').send({ exceptCurrent: true }).expect(403);
    await ownerAgent
      .post('/api/v1/auth/logout-all')
      .set('origin', origin)
      .set('x-csrf-token', ownerCsrf)
      .send({ exceptCurrent: true })
      .expect(204);
  });

  it('enforces permissions and tenant isolation', async () => {
    const otherOrganization = await prisma.organization.create({
      data: { name: 'Other tenant', slug: `${slug}-other` },
    });
    const otherUser = await prisma.user.create({
      data: {
        email: `${slug}-other@example.test`,
        firstName: 'Other',
        lastName: 'User',
        normalizedEmail: `${slug}-other@example.test`,
        organizationId: otherOrganization.id,
      },
    });
    await ownerAgent.get(`/api/v1/users/${otherUser.id}`).expect(404);

    const rolesResponse = await ownerAgent.get('/api/v1/roles').expect(200);
    const roles = responseBody<{
      data: Array<{
        id: string;
        name: string;
      }>;
    }>(rolesResponse).data;
    const staffRole = roles.find((role) => role.name === 'Staff')!;
    const invite = await ownerAgent
      .post('/api/v1/users/invitations')
      .set('origin', origin)
      .set('x-csrf-token', ownerCsrf)
      .send({
        email: `${slug}-staff@example.test`,
        firstName: 'Staff',
        lastName: 'Member',
        roleId: staffRole.id,
      })
      .expect(201);
    const invitationToken = new URL(
      responseBody<{ data: { invitationUrl: string } }>(invite).data.invitationUrl,
    ).searchParams.get('token')!;
    const storedInvitation = await prisma.userInvitation.findFirstOrThrow({
      where: { normalizedEmail: `${slug}-staff@example.test` },
    });
    expect(storedInvitation.tokenHash).not.toBe(invitationToken);
    await request(server).get(`/api/v1/users/invitations/${invitationToken}/validate`).expect(200);
    await request(server)
      .post(`/api/v1/users/invitations/${invitationToken}/accept`)
      .send({ password: 'Staff-password-2026!' })
      .expect(204);
    await request(server)
      .post(`/api/v1/users/invitations/${invitationToken}/accept`)
      .send({ password: 'Staff-password-2026!' })
      .expect(401);
    const staffAgent = request.agent(server);
    await staffAgent
      .post('/api/v1/auth/login')
      .send({ email: `${slug}-staff@example.test`, password: 'Staff-password-2026!' })
      .expect(200);
    await staffAgent.get('/api/v1/users').expect(403);
  }, 30_000);

  it('rejects expired invitations', async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({
      where: {
        organizationId_name: {
          organizationId: (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }))
            .organizationId,
          name: 'Viewer',
        },
      },
    });
    const invite = await ownerAgent
      .post('/api/v1/users/invitations')
      .set('origin', origin)
      .set('x-csrf-token', ownerCsrf)
      .send({
        email: `${slug}-expired@example.test`,
        firstName: 'Expired',
        lastName: 'Invite',
        roleId: viewerRole.id,
      })
      .expect(201);
    const token = new URL(
      responseBody<{ data: { invitationUrl: string } }>(invite).data.invitationUrl,
    ).searchParams.get('token')!;
    await prisma.userInvitation.updateMany({
      where: { normalizedEmail: `${slug}-expired@example.test` },
      data: { expiresAt: new Date(0) },
    });
    await request(server).get(`/api/v1/users/invitations/${token}/validate`).expect(401);
  });

  it('resets a password once, stores only a hash, and revokes existing sessions', async () => {
    await request(server)
      .post('/api/v1/auth/forgot-password')
      .send({ email: ownerEmail })
      .expect(202);
    const outbox = await request(server)
      .get('/api/v1/dev/emails')
      .set('x-dev-email-key', 'test-development-email-key')
      .expect(200);
    const message = responseBody<{ data: Array<{ to: string; text: string }> }>(outbox).data.find(
      (item) => item.to === ownerEmail,
    )!;
    const token = new URL(message.text.split(' ').at(-1)!).searchParams.get('token')!;
    const stored = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: ownerId },
      orderBy: { createdAt: 'desc' },
    });
    expect(stored.tokenHash).not.toBe(token);
    await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: nextPassword })
      .expect(204);
    await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: nextPassword })
      .expect(401);
    await ownerAgent.get('/api/v1/auth/me').expect(401);
  }, 30_000);

  it('rejects invalid and expired password reset tokens', async () => {
    await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'x'.repeat(43), password: nextPassword })
      .expect(401);
    const raw = 'y'.repeat(43);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    const { createHash } = await import('node:crypto');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(0),
      },
    });
    await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token: raw, password: nextPassword })
      .expect(401);
  });

  it('lists and revokes selected sessions, rejects expired sessions, and logs out', async () => {
    const first = request.agent(server);
    const firstLogin = await first
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password: nextPassword })
      .expect(200);
    const firstCsrf = csrfFrom(firstLogin);
    const second = request.agent(server);
    await second
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password: nextPassword })
      .expect(200);
    const sessionsResponse = await first.get('/api/v1/auth/sessions').expect(200);
    const sessions = responseBody<{
      data: Array<{
        id: string;
        current: boolean;
      }>;
    }>(sessionsResponse).data;
    const other = sessions.find((session) => !session.current)!;
    await first
      .delete(`/api/v1/auth/sessions/${other.id}`)
      .set('origin', origin)
      .set('x-csrf-token', firstCsrf)
      .expect(204);
    await second.get('/api/v1/auth/me').expect(401);

    const current = sessions.find((session) => session.current)!;
    await prisma.authSession.update({
      where: { id: current.id },
      data: { expiresAt: new Date(0) },
    });
    await first.get('/api/v1/auth/me').expect(401);

    const finalAgent = request.agent(server);
    const finalLogin = await finalAgent
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password: nextPassword })
      .expect(200);
    await finalAgent
      .post('/api/v1/auth/logout')
      .set('origin', origin)
      .set('x-csrf-token', csrfFrom(finalLogin))
      .expect(204);
    await finalAgent.get('/api/v1/auth/me').expect(401);
  }, 30_000);
});
