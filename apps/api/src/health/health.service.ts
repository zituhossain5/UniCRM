import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { DependencyStatus, HealthResponse } from '@unicrm/types';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthResponse> {
    const [databaseHealthy, redisHealthy] = await Promise.all([
      this.prisma.isHealthy(),
      this.redis.isHealthy(),
    ]);
    const database = this.toStatus(databaseHealthy);
    const redis = this.toStatus(redisHealthy);

    return {
      services: {
        api: 'connected',
        database,
        redis,
      },
      status: databaseHealthy && redisHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
    };
  }

  live() {
    return { status: 'ok' as const, timestamp: new Date().toISOString() };
  }

  async ready(): Promise<HealthResponse> {
    const result = await this.check();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException({
        message: 'UniCRM dependencies are not ready',
        ...result,
      });
    }
    return result;
  }

  private toStatus(healthy: boolean): DependencyStatus {
    return healthy ? 'connected' : 'disconnected';
  }
}
