import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { AuthMaintenanceService } from '../auth/auth-maintenance.service';
import type { EnvironmentVariables } from '../config/environment';
import { EmailTransportService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobsService } from './jobs.service';
import { UNICRM_QUEUE, type EmailJob } from './jobs.types';

@Injectable()
export class JobWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobWorkerService.name);
  private worker?: Worker;

  constructor(
    @Inject(AuthMaintenanceService) private readonly authMaintenance: AuthMaintenanceService,
    @Inject(ConfigService) private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(EmailTransportService) private readonly emailTransport: EmailTransportService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('WORKER_ENABLED', { infer: true })) {
      this.logger.warn('Worker started with WORKER_ENABLED=false; no jobs will be processed.');
      return;
    }

    this.worker = new Worker(
      UNICRM_QUEUE,
      async (job: Job) => {
        if (job.name === 'email-delivery') {
          await this.emailTransport.deliver(job.data as EmailJob);
          return;
        }
        if (job.name === 'notification-sweep') return this.notifications.generateScheduled();
        if (job.name === 'auth-maintenance')
          return this.authMaintenance.cleanupExpiredCredentials();
        throw new Error(`Unsupported job: ${job.name}`);
      },
      {
        connection: { url: this.config.get('REDIS_URL', { infer: true }) },
        prefix: this.config.get('JOB_QUEUE_PREFIX', { infer: true }),
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job failed: ${job?.name ?? 'unknown'} ${error.message}`, error.stack);
    });
    await this.jobs.scheduleRecurringMaintenance();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
