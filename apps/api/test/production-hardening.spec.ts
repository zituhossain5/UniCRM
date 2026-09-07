import { describe, expect, it, vi } from 'vitest';
import { validateEnvironment } from '../src/config/environment';
import { HealthService } from '../src/health/health.service';
import { JobsService } from '../src/jobs/jobs.service';

const queueAdd = vi.fn();
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
};

describe('production environment validation', () => {
  it('accepts the internal-beta production shape', () => {
    expect(validateEnvironment(baseProductionEnv).NODE_ENV).toBe('production');
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
      get: (key: string) => (key === 'REDIS_URL' ? 'redis://localhost:6379' : 'unicrm'),
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
  });
});
