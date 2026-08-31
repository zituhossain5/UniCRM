import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { EnvironmentVariables } from '../config/environment';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', () => undefined);
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    const result = await this.client.multi().incr(key).expire(key, ttlSeconds, 'NX').exec();
    const count = result?.[0]?.[1];
    if (typeof count !== 'number') {
      throw new Error('Redis rate-limit operation failed');
    }
    return count;
  }
}
