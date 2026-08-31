import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../generated/prisma/client';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import type { AuthenticatedPrincipal, RequestMetadata } from './auth.types';
import { PasswordService } from './password.service';
import { RateLimitService } from './rate-limit.service';
import { SecurityEventsService } from './security-events.service';
import { TokenService } from './token.service';

const userInclude = {
  organization: { select: { id: true, name: true, slug: true, status: true } },
  userRoles: {
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  },
} satisfies Prisma.UserInclude;

@Injectable()
export class AuthService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(SecurityEventsService) private readonly securityEvents: SecurityEventsService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string, request: RequestMetadata) {
    await this.rateLimit.consume('login', request.ipAddress ?? 'unknown');
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail: email },
      include: userInclude,
    });
    const valid = Boolean(
      user?.passwordHash &&
      user.status === 'ACTIVE' &&
      user.organization.status === 'ACTIVE' &&
      (await this.passwords.verify(user.passwordHash, password)),
    );
    if (!user || !valid) {
      await this.securityEvents.record({
        eventType: 'LOGIN_FAILED',
        organizationId: user?.organizationId,
        userId: user?.id,
        request,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionToken = this.tokens.generate();
    const csrfToken = this.tokens.generate();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.get('SESSION_TTL_SECONDS', { infer: true }) * 1000,
    );
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.authSession.create({
        data: {
          csrfTokenHash: this.tokens.hash(csrfToken),
          expiresAt,
          ipAddress: request.ipAddress,
          organizationId: user.organizationId,
          tokenHash: this.tokens.hash(sessionToken),
          userAgent: request.userAgent,
          userId: user.id,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      await tx.securityEvent.create({
        data: {
          eventType: 'LOGIN_SUCCESS',
          ipAddress: request.ipAddress,
          organizationId: user.organizationId,
          userAgent: request.userAgent,
          userId: user.id,
        },
      });
      return created;
    });
    return { csrfToken, sessionToken, data: this.safeUser(user), sessionId: session.id };
  }

  async currentUser(principal: AuthenticatedPrincipal) {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: principal.userId, organizationId: principal.organizationId },
      include: userInclude,
    });
    return this.safeUser(user);
  }

  async logout(principal: AuthenticatedPrincipal, request: RequestMetadata): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: { id: principal.sessionId, userId: principal.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.securityEvent.create({
        data: {
          eventType: 'LOGOUT',
          ipAddress: request.ipAddress,
          organizationId: principal.organizationId,
          userAgent: request.userAgent,
          userId: principal.userId,
        },
      }),
    ]);
  }

  async sessions(principal: AuthenticatedPrincipal) {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId: principal.userId,
        organizationId: principal.organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((session) => ({ ...session, current: session.id === principal.sessionId }));
  }

  async revokeSession(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    request: RequestMetadata,
  ): Promise<boolean> {
    const result = await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        userId: principal.userId,
        organizationId: principal.organizationId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (result.count) {
      await this.securityEvents.record({
        eventType: 'SESSION_REVOKED',
        organizationId: principal.organizationId,
        userId: principal.userId,
        metadata: { sessionId },
        request,
      });
    }
    return sessionId === principal.sessionId && result.count > 0;
  }

  async logoutAll(
    principal: AuthenticatedPrincipal,
    exceptCurrent: boolean,
    request: RequestMetadata,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: {
          userId: principal.userId,
          organizationId: principal.organizationId,
          revokedAt: null,
          ...(exceptCurrent ? { id: { not: principal.sessionId } } : {}),
        },
        data: { revokedAt: new Date() },
      }),
      this.prisma.securityEvent.create({
        data: {
          eventType: 'LOGOUT_ALL',
          ipAddress: request.ipAddress,
          metadata: { exceptCurrent },
          organizationId: principal.organizationId,
          userAgent: request.userAgent,
          userId: principal.userId,
        },
      }),
    ]);
  }

  async forgotPassword(normalizedEmail: string, request: RequestMetadata): Promise<void> {
    await this.rateLimit.consume('forgot-password', request.ipAddress ?? 'unknown');
    const user = await this.prisma.user.findUnique({ where: { normalizedEmail } });
    if (!user || user.status !== 'ACTIVE') return;

    const rawToken = this.tokens.generate();
    const expiresAt = new Date(
      Date.now() + this.config.get('PASSWORD_RESET_TTL_SECONDS', { infer: true }) * 1000,
    );
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.create({
        data: { expiresAt, tokenHash: this.tokens.hash(rawToken), userId: user.id },
      }),
      this.prisma.securityEvent.create({
        data: {
          eventType: 'PASSWORD_RESET_REQUESTED',
          ipAddress: request.ipAddress,
          organizationId: user.organizationId,
          userAgent: request.userAgent,
          userId: user.id,
        },
      }),
    ]);
    const url = `${this.config.get('APP_URL', { infer: true })}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.email.send({
      to: user.email,
      subject: 'Reset your UniCRM password',
      text: `Reset your password: ${url}`,
    });
  }

  async resetPassword(rawToken: string, password: string, request: RequestMetadata): Promise<void> {
    await this.rateLimit.consume('reset-password', request.ipAddress ?? 'unknown');
    const tokenHash = this.tokens.hash(rawToken);
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date() || reset.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const passwordHash = await this.passwords.hash(password);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (!consumed.count) throw new UnauthorizedException('Invalid or expired reset token');
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.authSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.securityEvent.create({
        data: {
          eventType: 'PASSWORD_RESET_COMPLETED',
          ipAddress: request.ipAddress,
          organizationId: reset.user.organizationId,
          userAgent: request.userAgent,
          userId: reset.userId,
        },
      });
    });
  }

  private safeUser(user: Prisma.UserGetPayload<{ include: typeof userInclude }>) {
    const roles = user.userRoles.map(({ role }) => role.name);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap(({ role }) =>
          role.rolePermissions.map(({ permission }) => permission.key),
        ),
      ),
    ];
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      organization: user.organization,
      roles,
      permissions,
    };
  }
}
