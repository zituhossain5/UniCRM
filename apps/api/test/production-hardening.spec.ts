import { describe, expect, it, vi } from 'vitest';
import { validateEnvironment } from '../src/config/environment';
import { HealthService } from '../src/health/health.service';
import { JobsService } from '../src/jobs/jobs.service';
import {
  MAILBOX_RECOVERY_JOB,
  MAILBOX_SYNC_ATTEMPTS,
  MAILBOX_SYNC_BACKOFF_MS,
  MAILBOX_SYNC_JOB,
} from '../src/mailboxes/mailbox.constants';

const queueAdd = vi
  .fn<(name: string, data: unknown, options: Record<string, unknown>) => Promise<void>>()
  .mockResolvedValue(undefined);
const queueClose = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: queueAdd,
    close: queueClose,
  })),
}));

const baseProductionEnv = {
  APP_URL: 'https://crm.example.com',
  CORS_ORIGINS: 'https://crm.example.com',
  DATABASE_URL: 'postgresql://unicrm:secret@postgres:5432/unicrm',
  EMAIL_DELIVERY_MODE: 'queue',
  EMAIL_TRANSPORT: 'smtp',
  INTEGRATION_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64'),
  LOG_FORMAT: 'json',
  NODE_ENV: 'production',
  REDIS_URL: 'redis://redis:6379',
  SESSION_COOKIE_SECURE: 'true',
  SMTP_HOST: 'smtp.example.com',
  STORAGE_DRIVER: 's3',
  STORAGE_S3_ACCESS_KEY_ID: 'access',
  STORAGE_S3_BUCKET: 'unicrm-private',
  STORAGE_S3_ENDPOINT: 'https://s3.example.com',
  STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
  STORAGE_S3_SERVER_SIDE_ENCRYPTION: 'none',
};

describe('production environment validation', () => {
  it('accepts the internal-beta production shape', () => {
    expect(validateEnvironment(baseProductionEnv).NODE_ENV).toBe('production');
    expect(
      validateEnvironment({ ...baseProductionEnv, STORAGE_S3_KMS_KEY_ID: '' })
        .STORAGE_S3_KMS_KEY_ID,
    ).toBeUndefined();
  });

  it('rejects insecure production origins and cookies', () => {
    expect(() =>
      validateEnvironment({
        ...baseProductionEnv,
        APP_URL: 'http://localhost:3001',
        CORS_ORIGINS: 'https://crm.example.com,*',
        SESSION_COOKIE_SECURE: 'false',
      }),
    ).toThrow(/APP_URL must be a public HTTPS origin|wildcard|SESSION_COOKIE_SECURE/);
  });

  it('rejects local storage and direct email in production', () => {
    expect(() =>
      validateEnvironment({
        ...baseProductionEnv,
        EMAIL_DELIVERY_MODE: 'direct',
        STORAGE_DRIVER: 'local',
      }),
    ).toThrow(/EMAIL_DELIVERY_MODE must be queue|STORAGE_DRIVER must be s3/);
  });

  it('requires an explicit supported S3 server-side encryption mode', () => {
    const missingMode: Partial<typeof baseProductionEnv> = { ...baseProductionEnv };
    delete missingMode.STORAGE_S3_SERVER_SIDE_ENCRYPTION;

    expect(() => validateEnvironment(missingMode)).toThrow(
      /STORAGE_S3_SERVER_SIDE_ENCRYPTION is required when STORAGE_DRIVER=s3/,
    );
    expect(() =>
      validateEnvironment({
        ...baseProductionEnv,
        STORAGE_S3_SERVER_SIDE_ENCRYPTION: 'unsupported',
      }),
    ).toThrow(/STORAGE_S3_SERVER_SIDE_ENCRYPTION/);
  });
});

describe('production health checks', () => {
  it('keeps liveness independent of dependencies', () => {
    const health = new HealthService(
      { isHealthy: () => Promise.resolve(false) } as never,
      { isHealthy: () => Promise.resolve(false) } as never,
    );

    expect(health.live()).toMatchObject({ status: 'ok' });
  });

  it('fails readiness when a dependency is disconnected', async () => {
    const health = new HealthService(
      { isHealthy: () => Promise.resolve(true) } as never,
      { isHealthy: () => Promise.resolve(false) } as never,
    );

    await expect(health.ready()).rejects.toThrow('UniCRM dependencies are not ready');
  });
});

describe('worker queue scheduling', () => {
  it('uses stable recurring job IDs for idempotent worker starts', async () => {
    queueAdd.mockClear();
    const service = new JobsService({
      get: (key: string) => {
        if (key === 'REDIS_URL') return 'redis://localhost:6379';
        if (key === 'MAILBOX_SYNC_INTERVAL_SECONDS') return 90;
        return 'unicrm';
      },
    } as never);

    await service.scheduleRecurringMaintenance();

    expect(queueAdd).toHaveBeenCalledWith(
      'notification-sweep',
      {},
      expect.objectContaining({ jobId: 'notification-sweep' }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      'auth-maintenance',
      {},
      expect.objectContaining({ jobId: 'auth-maintenance' }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      MAILBOX_RECOVERY_JOB,
      {},
      expect.objectContaining({
        jobId: MAILBOX_RECOVERY_JOB,
        repeat: { every: 90_000 },
      }),
    );
  });

  it('uses bounded mailbox retries, exponential backoff, and time-bucket deduplication', async () => {
    queueAdd.mockClear();
    const service = new JobsService({
      get: (key: string) => {
        if (key === 'REDIS_URL') return 'redis://localhost:6379';
        if (key === 'MAILBOX_SYNC_INTERVAL_SECONDS') return 90;
        return 'unicrm';
      },
    } as never);

    await service.enqueueMailboxSync('mailbox-id');

    expect(queueAdd).toHaveBeenCalledOnce();
    const [name, data, options] = queueAdd.mock.calls[0]!;
    expect(name).toBe(MAILBOX_SYNC_JOB);
    expect(data).toEqual({ mailboxId: 'mailbox-id' });
    expect(options.jobId).toMatch(/^mailbox-sync-mailbox-id-\d+$/);
    expect(options).toMatchObject({
      attempts: MAILBOX_SYNC_ATTEMPTS,
      backoff: { delay: MAILBOX_SYNC_BACKOFF_MS, type: 'exponential' },
    });
  });
});
