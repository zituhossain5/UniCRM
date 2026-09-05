import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/environment';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async consume(
    scope: string,
    identifier: string,
    options?: { limit: number; windowSeconds: number },
  ): Promise<void> {
    const windowSeconds =
      options?.windowSeconds ??
      this.config.get('AUTH_RATE_LIMIT_WINDOW_SECONDS', { infer: true }) ??
      60;
    const limit = options?.limit ?? this.config.get('AUTH_RATE_LIMIT_MAX', { infer: true }) ?? 10;
    const count = await this.redis.incrementWithExpiry(
      `rate:${scope}:${identifier}`,
      windowSeconds,
    );
    if (count > limit) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
