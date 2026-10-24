import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CookieService } from '../src/auth/cookie.service';
import { S3StorageService } from '../src/attachments/s3-storage.service';
import { validateEnvironment } from '../src/config/environment';
import { DEMO_CAPABILITY_MATRIX, DemoCapabilityService } from '../src/demo/demo-capability.service';
import { DemoCleanupService } from '../src/demo/demo-cleanup.service';
import { DemoQuotaService } from '../src/demo/demo-quota.service';
import { runtimeRouteDecision } from '../../web/src/lib/runtime-routing';

const demoConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    get: (key: string) =>
      ({ RUNTIME_MODE: 'demo', DEMO_CLEANUP_BATCH_SIZE: 20, DEMO_QUOTA_LEADS: 10, ...overrides })[
        key
      ],
  }) as never;

describe('Milestone 21C public demo hardening', () => {
  it('centralizes ordered allow, limited, simulated, and blocked capabilities', () => {
    expect(new Set(DEMO_CAPABILITY_MATRIX.map(({ capability }) => capability))).toEqual(
      new Set(['ALLOW', 'ALLOW_WITH_LIMITS', 'SIMULATE', 'BLOCK']),
    );
    const policy = new DemoCapabilityService(demoConfig());
    expect(policy.classify({ method: 'POST', path: '/api/v1/leads', url: '' })).toBe(
      'ALLOW_WITH_LIMITS',
    );
    expect(policy.classify({ method: 'GET', path: '/api/v1/reports', url: '' })).toBe(
      'ALLOW_WITH_LIMITS',
    );
    expect(policy.classify({ method: 'POST', path: '/api/v1/emails', url: '' })).toBe('SIMULATE');
    expect(policy.classify({ method: 'POST', path: '/api/v1/users/invitations', url: '' })).toBe(
      'BLOCK',
    );
    expect(policy.classify({ method: 'GET', path: '/api/v1/dev/emails', url: '' })).toBe('BLOCK');
    expect(policy.classify({ method: 'POST', path: '/api/v1/mail/threads/a/reply', url: '' })).toBe(
      'SIMULATE',
    );
  });

  it('lets normal and demo cookies coexist without redirecting normal app routes', () => {
    expect(runtimeRouteDecision('/app/leads', { demo: true, normal: true })).toBe('normal');
    expect(runtimeRouteDecision('/app/leads', { demo: true, normal: false })).toBe(
      'redirect-to-demo',
    );
    expect(runtimeRouteDecision('/demo/leads', { demo: true, normal: true })).toBe('demo');
  });

  it('sets isolated secure session and CSRF cookies with safe attributes', () => {
    const create = (sessionCookieName: string, csrfCookieName: string) => {
      const cookie = vi.fn();
      const service = new CookieService({
        get: (key: string) =>
          ({
            SESSION_COOKIE_NAME: sessionCookieName,
            CSRF_COOKIE_NAME: csrfCookieName,
            SESSION_COOKIE_SECURE: true,
            SESSION_TTL_SECONDS: 3600,
          })[key],
      } as never);
      service.set({ cookie } as never, 'session', 'csrf');
      return cookie;
    };
    const normal = create('unicrm_session', 'unicrm_csrf');
    const demo = create('unicrm_demo_session', 'unicrm_demo_csrf');
    expect(normal.mock.calls[0]?.[0]).not.toBe(demo.mock.calls[0]?.[0]);
    expect(normal.mock.calls[0]?.[2]).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(demo.mock.calls[1]?.[2]).toMatchObject({
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('rejects resource growth with a clear configured quota error', async () => {
    const service = new DemoQuotaService(
      demoConfig(),
      {
        lead: { count: vi.fn().mockResolvedValue(10) },
      } as never,
      {
        reserveBounded: vi.fn().mockResolvedValue(false),
      } as never,
    );
    await expect(
      service.assertRequestAllowed({ method: 'POST', path: '/api/v1/leads', url: '' }, {
        organizationId: 'org',
      } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('never deletes NORMAL organizations and makes repeated cleanup idempotent', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      organization: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst,
        deleteMany,
      },
      attachment: { findMany: vi.fn().mockResolvedValue([]) },
      emailAttachment: { findMany: vi.fn().mockResolvedValue([]) },
    } as never;
    const cleanup = new DemoCleanupService(
      demoConfig(),
      prisma,
      { delete: vi.fn() } as never,
      { record: vi.fn() } as never,
    );
    expect(await cleanup.destroyDemoOrganization('normal-id', new Date())).toBe(0);
    expect(await cleanup.cleanupExpired()).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalled();
    expect(JSON.stringify(findFirst.mock.calls)).toContain('"id":"normal-id"');
    expect(JSON.stringify(findFirst.mock.calls)).toContain('"mode":"DEMO"');
  });

  it('defers organization deletion when attachment cleanup fails', async () => {
    const deleteMany = vi.fn();
    const cleanup = new DemoCleanupService(
      demoConfig(),
      {
        organization: { findFirst: vi.fn().mockResolvedValue({ id: 'demo-id' }), deleteMany },
        attachment: { findMany: vi.fn().mockResolvedValue([{ storageKey: crypto.randomUUID() }]) },
        emailAttachment: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
      { delete: vi.fn().mockRejectedValue(new Error('storage unavailable')) } as never,
      { record: vi.fn() } as never,
    );
    await expect(cleanup.destroyDemoOrganization('demo-id', new Date())).rejects.toThrow(
      'Demo attachment cleanup failed',
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('accepts only UUID or namespaced demo S3 keys and rejects traversal', async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new S3StorageService({
      get: (key: string) =>
        ({
          STORAGE_S3_BUCKET: 'demo',
          STORAGE_S3_PREFIX: 'demo-root',
          STORAGE_S3_SERVER_SIDE_ENCRYPTION: 'none',
          STORAGE_S3_ACCESS_KEY_ID: 'a',
          STORAGE_S3_SECRET_ACCESS_KEY: 'b',
          STORAGE_S3_REGION: 'us-east-1',
          STORAGE_S3_FORCE_PATH_STYLE: true,
        })[key],
    } as never);
    Object.defineProperty(storage, 'client', { value: { send } });
    const organizationId = crypto.randomUUID();
    const objectId = crypto.randomUUID();
    await storage.put(`demo/${organizationId}/${objectId}`, Buffer.from('safe'));
    expect((send.mock.calls[0]?.[0] as { input: { Key: string } }).input.Key).toBe(
      `demo-root/demo/${organizationId}/${objectId}`,
    );
    await expect(storage.put('../production/key', Buffer.from('unsafe'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('validates Turnstile pairing and critical isolated demo runtime settings', () => {
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
    expect(validateEnvironment(base).RUNTIME_MODE).toBe('demo');
    expect(() => validateEnvironment({ ...base, DEMO_TURNSTILE_ENABLED: 'true' })).toThrow(
      'DEMO_TURNSTILE_SECRET',
    );
    expect(() => validateEnvironment({ ...base, SESSION_COOKIE_NAME: 'unicrm_session' })).toThrow(
      'isolated SESSION_COOKIE_NAME',
    );
  });
});
