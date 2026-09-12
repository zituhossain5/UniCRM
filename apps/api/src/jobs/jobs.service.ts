import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvironmentVariables } from '../config/environment';
import {
  INTEGRATION_PROCESSING_JOB,
  WEBHOOK_DELIVERY_JOB,
} from '../integrations/integration.constants';
import {
  AUTOMATION_EXECUTION_JOB,
  AUTOMATION_RECOVERY_JOB,
} from '../automations/automation.constants';
import { UNICRM_QUEUE, type EmailJob } from './jobs.types';
import { CRM_EMAIL_DELIVERY_JOB, CRM_EMAIL_RECOVERY_JOB } from '../email/email.constants';
import { MAILBOX_RECOVERY_JOB, MAILBOX_SYNC_JOB } from '../mailboxes/mailbox.constants';

@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
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

  async enqueueCrmEmail(messageId: string): Promise<void> {
    await this.getQueue().add(
      CRM_EMAIL_DELIVERY_JOB,
      { messageId },
      {
        jobId: `crm-email-${messageId}-${Date.now()}`,
        attempts: 5,
        backoff: { delay: 10_000, type: 'exponential' },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800, count: 5000 },
      },
    );
  }

  async enqueueMailboxSync(mailboxId: string): Promise<void> {
    await this.getQueue().add(
      MAILBOX_SYNC_JOB,
      { mailboxId },
      {
        jobId: `mailbox-sync-${mailboxId}-${Date.now()}`,
        attempts: 3,
        backoff: { delay: 10_000, type: 'exponential' },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800, count: 5000 },
      },
    );
  }

  async enqueueIntegrationEvent(eventId: string): Promise<void> {
    const job = await this.getQueue().add(
      INTEGRATION_PROCESSING_JOB,
      { eventId },
      {
        jobId: `integration-event-${eventId}`,
        attempts: 5,
        backoff: { delay: 5_000, type: 'exponential' },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800, count: 5000 },
      },
    );
    this.logger.debug(
      `Queued integration event job=${job.id ?? 'unknown'} eventId=${eventId} queue=${UNICRM_QUEUE}`,
    );
  }

  async enqueueWebhookDelivery(deliveryId: string): Promise<void> {
    const job = await this.getQueue().add(
      WEBHOOK_DELIVERY_JOB,
      { deliveryId },
      {
        jobId: `webhook-delivery-${deliveryId}-${Date.now()}`,
        attempts: 5,
        backoff: { delay: 5_000, type: 'exponential' },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800, count: 5000 },
      },
    );
    this.logger.debug(
      `Queued webhook delivery job=${job.id ?? 'unknown'} deliveryId=${deliveryId} queue=${UNICRM_QUEUE}`,
    );
  }

  async enqueueAutomationRun(runId: string): Promise<void> {
    const job = await this.getQueue().add(
      AUTOMATION_EXECUTION_JOB,
      { runId },
      {
        jobId: `automation-run-${runId}-${Date.now()}`,
        attempts: 3,
        backoff: { delay: 5_000, type: 'exponential' },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800, count: 5000 },
      },
    );
    this.logger.debug(
      `Queued automation run job=${job.id ?? 'unknown'} runId=${runId} queue=${UNICRM_QUEUE}`,
    );
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
      this.getQueue().add(
        'integration-recovery',
        {},
        {
          jobId: 'integration-recovery',
          repeat: { every: 60_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 604_800, count: 5000 },
        },
      ),
      this.getQueue().add(
        AUTOMATION_RECOVERY_JOB,
        {},
        {
          jobId: AUTOMATION_RECOVERY_JOB,
          repeat: { every: 60_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 604_800, count: 5000 },
        },
      ),
      this.getQueue().add(
        CRM_EMAIL_RECOVERY_JOB,
        {},
        {
          jobId: CRM_EMAIL_RECOVERY_JOB,
          repeat: { every: 60_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 604_800, count: 5000 },
        },
      ),
      this.getQueue().add(
        MAILBOX_RECOVERY_JOB,
        {},
        {
          jobId: MAILBOX_RECOVERY_JOB,
          repeat: { every: 5 * 60_000 },
          removeOnComplete: { age: 86_400, count: 1000 },
          removeOnFail: { age: 604_800, count: 5000 },
        },
      ),
    ]);
    this.logger.log(
      `Scheduled recurring jobs queue=${UNICRM_QUEUE} prefix=${this.config.get('JOB_QUEUE_PREFIX', { infer: true })}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(UNICRM_QUEUE, {
        connection: { url: this.config.get('REDIS_URL', { infer: true }) },
        prefix: this.config.get('JOB_QUEUE_PREFIX', { infer: true }),
      });
      this.logger.log(
        `BullMQ producer ready queue=${UNICRM_QUEUE} prefix=${this.config.get('JOB_QUEUE_PREFIX', { infer: true })} redis=${this.describeRedis()}`,
      );
    }
    return this.queue;
  }

  private describeRedis(): string {
    const redisUrl = new URL(this.config.get('REDIS_URL', { infer: true }));
    const database = redisUrl.pathname.replace('/', '') || '0';
    return `${redisUrl.hostname}:${redisUrl.port || '6379'}/${database}`;
  }
}
