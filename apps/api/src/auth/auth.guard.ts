import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { PUBLIC_ROUTE } from './auth.constants';
import { CookieService } from './cookie.service';
import { TokenService } from './token.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(CookieService) private readonly cookies: CookieService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const rawToken = request.cookies?.[this.cookies.sessionCookieName] as string | undefined;
    if (!rawToken) throw new UnauthorizedException('Authentication required');

    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: this.tokens.hash(rawToken) },
      include: {
        organization: { select: { status: true } },
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: { rolePermissions: { include: { permission: true } } },
                },
              },
            },
          },
        },
      },
    });

    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE' ||
      session.organization.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Authentication required');
    }

    const roles = session.user.userRoles.map(({ role }) => role.name);
    const permissions = [
      ...new Set(
        session.user.userRoles.flatMap(({ role }) =>
          role.rolePermissions.map(({ permission }) => permission.key),
        ),
      ),
    ];
    (request as AuthenticatedRequest).auth = {
      csrfTokenHash: session.csrfTokenHash,
      organizationId: session.organizationId,
      permissions,
      roles,
      sessionId: session.id,
      userId: session.userId,
    };

    if (now.getTime() - session.lastUsedAt.getTime() > 60_000) {
      void this.prisma.authSession.update({ where: { id: session.id }, data: { lastUsedAt: now } });
    }
    return true;
  }
}
