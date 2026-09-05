import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvironmentVariables } from '../config/environment';
import { UNICRM_QUEUE, type EmailJob } from './jobs.types';

@Injectable()
export class JobsService implements OnModuleDestroy {
  private queue?: Queue;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async enqueueEmail(data: EmailJob): Promise<void> {
    await this.getQueue().add('email-delivery', data, {
      attempts: 5,
      backoff: { delay: 10_000, type: 'exponential' },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800, count: 5000 },
    });
  }

  async scheduleRecurringMaintenance(): Promise<void> {
    await Promise.all([
      this.getQueue().add(
        'notification-sweep',
        {},
        {
          jobId: 'notification-sweep',
          repeat: { every: 15 * 60_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 604_800, count: 5000 },
        },
      ),
      this.getQueue().add(
        'auth-maintenance',
        {},
        {
          jobId: 'auth-maintenance',
          repeat: { every: 60 * 60_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 604_800, count: 5000 },
        },
      ),
    ]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private getQueue(): Queue {
    this.queue ??= new Queue(UNICRM_QUEUE, {
      connection: { url: this.config.get('REDIS_URL', { infer: true }) },
      prefix: this.config.get('JOB_QUEUE_PREFIX', { infer: true }),
    });
    return this.queue;
  }
}
