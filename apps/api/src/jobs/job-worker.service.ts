import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { AuthMaintenanceService } from '../auth/auth-maintenance.service';
import type { EnvironmentVariables } from '../config/environment';
import { EmailTransportService } from '../email/email.service';
import { CrmEmailService } from '../email/crm-email.service';
import { CRM_EMAIL_DELIVERY_JOB, CRM_EMAIL_RECOVERY_JOB } from '../email/email.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { AutomationsService } from '../automations/automations.service';
import {
  AUTOMATION_EXECUTION_JOB,
  AUTOMATION_RECOVERY_JOB,
} from '../automations/automation.constants';
import {
  INTEGRATION_PROCESSING_JOB,
  INTEGRATION_RECOVERY_JOB,
  WEBHOOK_DELIVERY_JOB,
} from '../integrations/integration.constants';
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
    @Inject(CrmEmailService) private readonly crmEmail: CrmEmailService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(IntegrationsService) private readonly integrations: IntegrationsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('WORKER_ENABLED', { infer: true })) {
      this.logger.warn('Worker started with WORKER_ENABLED=false; no jobs will be processed.');
      return;
    }

    this.logger.log(
      `BullMQ worker starting queue=${UNICRM_QUEUE} prefix=${this.config.get('JOB_QUEUE_PREFIX', { infer: true })} redis=${this.describeRedis()}`,
    );
    this.worker = new Worker(
      UNICRM_QUEUE,
      async (job: Job) => {
        if (job.name === 'email-delivery') {
          await this.emailTransport.deliver(job.data as EmailJob);
          return;
        }
        if (job.name === CRM_EMAIL_DELIVERY_JOB)
          return this.crmEmail.processDelivery(
            (job.data as { messageId: string }).messageId,
            job.attemptsMade,
            job.opts.attempts ?? 1,
          );
        if (job.name === CRM_EMAIL_RECOVERY_JOB) return this.crmEmail.recoverQueued();
        if (job.name === 'notification-sweep') return this.notifications.generateScheduled();
        if (job.name === 'auth-maintenance')
          return this.authMaintenance.cleanupExpiredCredentials();
        if (job.name === INTEGRATION_PROCESSING_JOB)
          return this.integrations.processInboundEvent((job.data as { eventId: string }).eventId);
        if (job.name === WEBHOOK_DELIVERY_JOB)
          return this.integrations.processDelivery((job.data as { deliveryId: string }).deliveryId);
        if (job.name === INTEGRATION_RECOVERY_JOB) return this.integrations.recoverPendingWork();
        if (job.name === AUTOMATION_EXECUTION_JOB)
          return this.automations.processRun((job.data as { runId: string }).runId);
        if (job.name === AUTOMATION_RECOVERY_JOB) return this.automations.recoverPendingRuns();
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
    const recovered = await this.integrations.recoverPendingWork();
    this.logger.log(
      `Integration recovery queued events=${recovered.events} deliveries=${recovered.deliveries}`,
    );
    const recoveredAutomations = await this.automations.recoverPendingRuns();
    this.logger.log(`Automation recovery queued runs=${recoveredAutomations.runs}`);
    const recoveredEmails = await this.crmEmail.recoverQueued();
    this.logger.log(`CRM email recovery queued messages=${recoveredEmails.messages}`);
  }

  async onApplicationShutdown(): Promise<void> {
    this.logger.log(`BullMQ worker stopping queue=${UNICRM_QUEUE}`);
    await this.worker?.close();
  }

  private describeRedis(): string {
    const redisUrl = new URL(this.config.get('REDIS_URL', { infer: true }));
    const database = redisUrl.pathname.replace('/', '') || '0';
    return `${redisUrl.hostname}:${redisUrl.port || '6379'}/${database}`;
  }
}
