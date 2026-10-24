import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { RequestMetadata } from '../auth/auth.types';
import { RateLimitService } from '../auth/rate-limit.service';
import { TokenService } from '../auth/token.service';
import { IdentityBootstrapService } from '../bootstrap.service';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { DemoSeederService } from './demo-seeder.service';
import { DEMO_UNAVAILABLE_MESSAGE } from './demo.constants';

@Injectable()
export class DemoService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(IdentityBootstrapService) private readonly bootstrap: IdentityBootstrapService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(DemoSeederService) private readonly seeder: DemoSeederService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async start(request: RequestMetadata) {
    if (this.config.get('RUNTIME_MODE', { infer: true }) !== 'demo')
      throw new ForbiddenException(DEMO_UNAVAILABLE_MESSAGE);
    await this.rateLimit.consume('demo-start', request.ipAddress ?? 'unknown', {
      limit: this.config.get('DEMO_START_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.config.get('DEMO_START_RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
    });

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
      return { sessionToken, csrfToken, expiresAt };
    } catch (cause) {
      await this.prisma.organization.deleteMany({
        where: { id: user.organizationId, mode: 'DEMO' },
      });
      throw cause;
    }
  }
}
