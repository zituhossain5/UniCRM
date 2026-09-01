import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { allowedCorsOrigins } from '../config/cors';
import type { EnvironmentVariables } from '../config/environment';
import { PUBLIC_ROUTE } from './auth.constants';
import { CookieService } from './cookie.service';
import { TokenService } from './token.service';
import type { AuthenticatedRequest } from './auth.types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
    @Inject(CookieService) private readonly cookies: CookieService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {
    this.allowedOrigins = new Set(
      allowedCorsOrigins(
        config.get('CORS_ORIGINS', { infer: true }),
        config.get('NODE_ENV', { infer: true }),
      ),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.get('origin');
    const cookieToken = request.cookies?.[this.cookies.csrfCookieName] as string | undefined;
    const headerToken = request.get('x-csrf-token');
    if (
      !origin ||
      !this.allowedOrigins.has(origin) ||
      !cookieToken ||
      !headerToken ||
      cookieToken !== headerToken ||
      !this.tokens.matches(headerToken, request.auth.csrfTokenHash)
    ) {
      throw new ForbiddenException('CSRF validation failed');
    }
    return true;
  }
}
