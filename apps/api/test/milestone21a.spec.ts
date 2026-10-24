import { describe, expect, it, vi } from 'vitest';
import { DemoCapabilityService } from '../src/demo/demo-capability.service';
import { DemoCleanupService } from '../src/demo/demo-cleanup.service';
import { validateEnvironment } from '../src/config/environment';

describe('Milestone 21A demo policy', () => {
  const config = { get: (key: string) => (key === 'RUNTIME_MODE' ? 'demo' : 20) } as never;
  const capabilities = new DemoCapabilityService(config);

  it('default-blocks external and security-sensitive mutations while allowing CRM work', () => {
    expect(
      capabilities.isBlocked({ method: 'POST', path: '/api/v1/users/invitations' } as never),
    ).toBe(true);
    expect(capabilities.isBlocked({ method: 'POST', path: '/api/v1/mailboxes' } as never)).toBe(
      true,
    );
    expect(
      capabilities.isBlocked({ method: 'POST', path: '/api/v1/integrations/webhooks' } as never),
    ).toBe(true);
    expect(
      capabilities.isBlocked({ method: 'POST', path: '/api/v1/data-management/exports' } as never),
    ).toBe(true);
    expect(capabilities.isBlocked({ method: 'POST', path: '/api/v1/leads' } as never)).toBe(false);
  });

  it('accepts production-mode defaults and demo-mode console transport', () => {
    const base = {
      APP_URL: 'https://crm.example.com',
      CORS_ORIGINS: 'https://crm.example.com',
      DATABASE_URL: 'postgresql://demo:secret@demo-postgres:5432/demo',
      EMAIL_DELIVERY_MODE: 'queue',
      EMAIL_TRANSPORT: 'console',
      INTEGRATION_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      LOG_FORMAT: 'json',
      NODE_ENV: 'production',
      REDIS_URL: 'redis://demo-redis:6379',
      RUNTIME_MODE: 'demo',
      SESSION_COOKIE_NAME: 'unicrm_demo_session',
      CSRF_COOKIE_NAME: 'unicrm_demo_csrf',
      JOB_QUEUE_PREFIX: 'unicrm-demo',
      SESSION_COOKIE_SECURE: 'true',
      STORAGE_DRIVER: 's3',
      STORAGE_S3_ACCESS_KEY_ID: 'demo',
      STORAGE_S3_BUCKET: 'demo',
      STORAGE_S3_ENDPOINT: 'https://s3.example.com',
      STORAGE_S3_SECRET_ACCESS_KEY: 'demo',
      STORAGE_S3_SERVER_SIDE_ENCRYPTION: 'none',
    };
    expect(validateEnvironment(base)).toMatchObject({
      RUNTIME_MODE: 'demo',
      EMAIL_TRANSPORT: 'console',
    });
    expect(
      validateEnvironment({
        ...base,
        RUNTIME_MODE: undefined,
        EMAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.example.com',
      }).RUNTIME_MODE,
    ).toBe('production');
  });

  it('cleanup always includes DEMO mode and expiry in its delete predicate', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      organization: {
        findMany: vi.fn().mockResolvedValue([{ id: 'demo-id' }]),
        findFirst: vi.fn().mockResolvedValue({ id: 'demo-id' }),
        deleteMany,
      },
      attachment: { findMany: vi.fn().mockResolvedValue([]) },
      emailAttachment: { findMany: vi.fn().mockResolvedValue([]) },
    } as never;
    const cleanup = new DemoCleanupService(
      config,
      prisma,
      { delete: vi.fn() } as never,
      { record: vi.fn() } as never,
    );
    const now = new Date();
    expect(await cleanup.cleanupExpired(now)).toBe(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'demo-id', mode: 'DEMO', demoExpiresAt: { lte: now } },
    });
  });
});
