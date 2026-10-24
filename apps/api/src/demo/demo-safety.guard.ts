import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { RateLimitService } from '../auth/rate-limit.service';
import type { AuthenticatedRequest } from '../auth/auth.types';
import type { EnvironmentVariables } from '../config/environment';
import { requestIdFrom } from '../common/request-context';
import { DemoCapabilityService } from './demo-capability.service';
import { DEMO_BLOCKED_MESSAGE, DEMO_RATE_LIMIT_MESSAGE } from './demo.constants';
import { DemoObservabilityService } from './demo-observability.service';
import { DemoQuotaService } from './demo-quota.service';

@Injectable()
export class DemoSafetyGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(DemoCapabilityService) private readonly capabilities: DemoCapabilityService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(DemoQuotaService) private readonly quotas: DemoQuotaService,
    @Inject(DemoObservabilityService) private readonly observability: DemoObservabilityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.capabilities.isDemoRuntime()) return true;
    const request = context.switchToHttp().getRequest<Request & Partial<AuthenticatedRequest>>();
    if (this.capabilities.isBlocked(request)) {
      this.observability.record(
        'demo_blocked_action',
        {
          method: request.method,
          path: this.capabilities.apiPath(request),
          organizationId: request.auth?.organizationId,
          requestId: requestIdFrom(request),
          result: 'blocked',
        },
        'warn',
      );
      throw new ForbiddenException(DEMO_BLOCKED_MESSAGE);
    }

    const principal = request.auth;
    const path = request.path || request.url.split('?')[0] || '/';
    if (principal) await this.quotas.assertRequestAllowed(request, principal);

    if (principal && ['GET', 'HEAD'].includes(request.method)) {
      if (request.url.length > this.config.get('DEMO_QUERY_MAX_URL_LENGTH', { infer: true })) {
        throw new BadRequestException('Public demo query filters are too large');
      }
      const rawLimit = request.query?.limit ?? request.query?.pageSize ?? request.query?.take;
      const limit = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
      const maxPageSize = this.config.get('DEMO_QUERY_MAX_PAGE_SIZE', { infer: true });
      if (typeof limit === 'string' && Number(limit) > maxPageSize) {
        throw new BadRequestException(`Public demo queries support at most ${maxPageSize} records`);
      }
    }
    if (
      principal &&
      ['GET', 'HEAD'].includes(request.method) &&
      /\/(search|reports|forecast|activities|follow-ups|saved-views)(\/|$)/.test(path)
    ) {
      await this.consume(
        request,
        'demo-query',
        `${principal.organizationId}:${principal.userId}`,
        this.config.get('DEMO_QUERY_RATE_LIMIT_MAX', { infer: true }),
        this.config.get('DEMO_QUERY_RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
      );
    }
    if (principal && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      await this.consume(
        request,
        'demo-record',
        `${principal.organizationId}:${principal.userId}`,
        this.config.get('DEMO_RECORD_RATE_LIMIT_MAX', { infer: true }),
        this.config.get('DEMO_RECORD_RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
      );
    }
    return true;
  }

  private async consume(
    request: Request & Partial<AuthenticatedRequest>,
    scope: string,
    identifier: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    try {
      await this.rateLimit.consume(scope, identifier, { limit, windowSeconds });
    } catch (cause) {
      if (cause instanceof HttpException && cause.getStatus() === 429) {
        this.observability.record(
          'demo_rate_limited',
          {
            organizationId: request.auth?.organizationId,
            path: this.capabilities.apiPath(request),
            requestId: requestIdFrom(request),
            result: 'rejected',
            scope,
          },
          'warn',
        );
        throw new HttpException(DEMO_RATE_LIMIT_MESSAGE, 429);
      }
      throw cause;
    }
  }
}
