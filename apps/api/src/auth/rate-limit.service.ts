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

  async consume(scope: string, identifier: string): Promise<void> {
    const count = await this.redis.incrementWithExpiry(
      `auth-rate:${scope}:${identifier}`,
      this.config.get('AUTH_RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
    );
    if (count > this.config.get('AUTH_RATE_LIMIT_MAX', { infer: true })) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
