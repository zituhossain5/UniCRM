import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { RequestMetadata } from '../auth/auth.types';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { RateLimitService } from '../auth/rate-limit.service';
import { TokenService } from '../auth/token.service';
import { IdentityBootstrapService } from '../bootstrap.service';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { DemoSeederService } from './demo-seeder.service';
import { DEMO_UNAVAILABLE_MESSAGE } from './demo.constants';
import { DemoCleanupService } from './demo-cleanup.service';
import { RedisService } from '../redis/redis.service';
import { DemoTurnstileService } from './demo-turnstile.service';
import { DemoObservabilityService } from './demo-observability.service';
import { DEMO_RATE_LIMIT_MESSAGE, DEMO_START_UNAVAILABLE_MESSAGE } from './demo.constants';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(IdentityBootstrapService) private readonly bootstrap: IdentityBootstrapService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(DemoSeederService) private readonly seeder: DemoSeederService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(DemoCleanupService) private readonly cleanup: DemoCleanupService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(DemoTurnstileService) private readonly turnstile: DemoTurnstileService,
    @Inject(DemoObservabilityService) private readonly observability: DemoObservabilityService,
  ) {}

  async start(
    request: RequestMetadata,
    turnstileToken?: string,
    existingSession?: string,
    trustedRestart = false,
  ) {
    if (this.config.get('RUNTIME_MODE', { infer: true }) !== 'demo')
      throw new ForbiddenException(DEMO_UNAVAILABLE_MESSAGE);
    const startedAt = Date.now();
    try {
      const rateOptions = {
        limit: this.config.get('DEMO_START_RATE_LIMIT_MAX', { infer: true }),
        windowSeconds: this.config.get('DEMO_START_RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
      };
      await this.rateLimit.consume('demo-start-ip', request.ipAddress ?? 'unknown', rateOptions);
      if (existingSession) {
        await this.rateLimit.consume(
          'demo-start-session',
          this.tokens.hash(existingSession),
          rateOptions,
        );
      }
      if (!trustedRestart) await this.turnstile.verify(turnstileToken, request.ipAddress);

      const lockKey = 'demo:workspace-creation';
      const lockToken = await this.acquireCreationLock(lockKey);
      if (!lockToken) throw new ServiceUnavailableException(DEMO_START_UNAVAILABLE_MESSAGE);
      try {
        const active = await this.prisma.organization.count({
          where: { mode: 'DEMO', demoExpiresAt: { gt: new Date() } },
        });
        if (active >= this.config.get('DEMO_MAX_ACTIVE_WORKSPACES', { infer: true })) {
          throw new ServiceUnavailableException(DEMO_START_UNAVAILABLE_MESSAGE);
        }
        const result = await this.createWorkspace(request);
        this.observability.record('demo_started', {
          activeWorkspaces: active + 1,
          durationMs: Date.now() - startedAt,
          organizationId: result.organizationId,
          requestId: request.requestId,
          result: 'created',
        });
        return result;
      } finally {
        await this.redis.releaseLock(lockKey, lockToken).catch(() => undefined);
      }
    } catch (cause) {
      this.observability.record(
        cause instanceof HttpException && cause.getStatus() === 429
          ? 'demo_rate_limited'
          : 'demo_start_rejected',
        {
          durationMs: Date.now() - startedAt,
          requestId: request.requestId,
          result: 'rejected',
          status: cause instanceof HttpException ? cause.getStatus() : 503,
        },
        'warn',
      );
      if (cause instanceof HttpException) {
        if (cause.getStatus() === 429) {
          throw new HttpException(DEMO_RATE_LIMIT_MESSAGE, 429);
        }
        throw cause;
      }
      throw new ServiceUnavailableException(DEMO_START_UNAVAILABLE_MESSAGE);
    }
  }

  async restart(principal: AuthenticatedPrincipal, request: RequestMetadata) {
    if (
      this.config.get('RUNTIME_MODE', { infer: true }) !== 'demo' ||
      principal.organizationMode !== 'DEMO'
    )
      throw new ForbiddenException(DEMO_UNAVAILABLE_MESSAGE);

    const result = await this.start(request, undefined, undefined, true);
    const expiredAt = new Date();
    try {
      await this.prisma.organization.updateMany({
        where: { id: principal.organizationId, mode: 'DEMO' },
        data: { demoExpiresAt: expiredAt },
      });
      await this.cleanup.destroyDemoOrganization(principal.organizationId, expiredAt);
    } catch {
      this.logger.warn(
        `Previous demo workspace cleanup deferred organizationId=${principal.organizationId}`,
      );
    }
    return result;
  }

  private async createWorkspace(request: RequestMetadata) {
    const marker = randomBytes(4).toString('hex').toUpperCase();
    const slug = `demo-${marker.toLowerCase()}-${Date.now().toString(36)}`;
    const email = `${slug}@demo.invalid`;
    const expiresAt = new Date(
      Date.now() + this.config.get('DEMO_SESSION_TTL_SECONDS', { infer: true }) * 1000,
    );
    await this.bootstrap.run({
      organizationName: `UniCRM Demo ${marker}`,
      organizationSlug: slug,
      organizationMode: 'DEMO',
      demoExpiresAt: expiresAt,
      adminEmail: email,
      adminPassword: randomBytes(32).toString('base64url'),
      adminFirstName: 'Demo',
      adminLastName: 'Admin',
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { normalizedEmail: email } });
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        emailFromName: 'UniCRM Demo',
        emailFromAddress: 'demo@unicrm.invalid',
        emailReplyTo: 'demo@unicrm.invalid',
      },
    });
    try {
      await this.seeder.seed(user.organizationId, user.id);
      const sessionToken = this.tokens.generate();
      const csrfToken = this.tokens.generate();
      await this.prisma.authSession.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          tokenHash: this.tokens.hash(sessionToken),
          csrfTokenHash: this.tokens.hash(csrfToken),
          expiresAt,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
        },
      });
      return { sessionToken, csrfToken, expiresAt, organizationId: user.organizationId };
    } catch (cause) {
      await this.prisma.organization.deleteMany({
        where: { id: user.organizationId, mode: 'DEMO' },
      });
      throw cause;
    }
  }

  private async acquireCreationLock(key: string): Promise<string | null> {
    const deadline = Date.now() + 20_000;
    do {
      const token = await this.redis.acquireLock(key, 30);
      if (token) return token;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    return null;
  }
}
