import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { RateLimitService } from '../auth/rate-limit.service';
import type { AuthenticatedRequest } from '../auth/auth.types';
import type { EnvironmentVariables } from '../config/environment';
import { DemoCapabilityService } from './demo-capability.service';
import { DEMO_UNAVAILABLE_MESSAGE } from './demo.constants';

@Injectable()
export class DemoSafetyGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(DemoCapabilityService) private readonly capabilities: DemoCapabilityService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.capabilities.isDemoRuntime()) return true;
    const request = context.switchToHttp().getRequest<Request & Partial<AuthenticatedRequest>>();
    if (this.capabilities.isBlocked(request))
      throw new ForbiddenException(DEMO_UNAVAILABLE_MESSAGE);

    const principal = request.auth;
    const path = request.path || request.url.split('?')[0] || '/';
    if (
      principal &&
      ['GET', 'HEAD'].includes(request.method) &&
      /\/(search|reports)(\/|$)/.test(path)
    ) {
      await this.rateLimit.consume(
        'demo-query',
        `${principal.organizationId}:${principal.userId}`,
        {
          limit: this.config.get('DEMO_QUERY_RATE_LIMIT_MAX', { infer: true }),
          windowSeconds: this.config.get('DEMO_QUERY_RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
        },
      );
    }
    if (principal && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      await this.rateLimit.consume(
        'demo-record',
        `${principal.organizationId}:${principal.userId}`,
        {
          limit: this.config.get('DEMO_RECORD_RATE_LIMIT_MAX', { infer: true }),
          windowSeconds: this.config.get('DEMO_RECORD_RATE_LIMIT_WINDOW_SECONDS', {
            infer: true,
          }),
        },
      );
    }
    return true;
  }
}
