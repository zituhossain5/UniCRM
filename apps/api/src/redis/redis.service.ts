import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
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

  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    if (this.client.status === 'wait') await this.client.connect();
    const token = randomUUID();
    const result = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token,
    );
  }

  async reserveBounded(
    key: string,
    initialCount: number,
    limit: number,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (this.client.status === 'wait') await this.client.connect();
    const result = await this.client.eval(
      "local current=redis.call('get',KEYS[1]); if not current then current=tonumber(ARGV[1]); redis.call('set',KEYS[1],current,'EX',ARGV[3]); else current=tonumber(current); end; if current>=tonumber(ARGV[2]) then return 0; end; redis.call('incr',KEYS[1]); redis.call('expire',KEYS[1],ARGV[3]); return 1;",
      1,
      key,
      initialCount,
      limit,
      ttlSeconds,
    );
    return result === 1;
  }
}
