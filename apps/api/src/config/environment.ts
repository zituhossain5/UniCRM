import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z
  .object({
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().max(65_535).default(4000),
    CORS_ORIGINS: z.string().min(1),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    APP_URL: z.url().default('http://localhost:3001'),
    ARGON2_MEMORY_COST: z.coerce.number().int().min(19_456).default(65_536),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(16).default(1),
    ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(3),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    CSRF_COOKIE_NAME: z.string().min(1).default('unicrm_csrf'),
    DEV_EMAIL_KEY: z.string().min(16).default('replace_local_email_key'),
    EMAIL_DELIVERY_MODE: z.enum(['direct', 'queue']).default('direct'),
    EMAIL_FROM: z.string().min(1).default('UniCRM <noreply@localhost>'),
    EMAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
    FILE_UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    INVITATION_TTL_SECONDS: z.coerce.number().int().positive().default(172_800),
    JOB_QUEUE_PREFIX: z.string().min(1).default('unicrm'),
    LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
    REQUEST_ID_HEADER: z.string().min(1).default('x-request-id'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    REDIS_URL: z.string().startsWith('redis://'),
    SEARCH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    SEARCH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    SESSION_COOKIE_NAME: z.string().min(1).default('unicrm_session'),
    SESSION_COOKIE_SECURE: booleanFromString,
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
    SMTP_FROM: z.string().min(1).optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanFromString,
    SMTP_USER: z.string().optional(),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().min(1).default('.local/uploads'),
    STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_S3_BUCKET: z.string().optional(),
    STORAGE_S3_ENDPOINT: z.url().optional(),
    STORAGE_S3_FORCE_PATH_STYLE: booleanFromString,
    STORAGE_S3_PREFIX: z.string().default('attachments'),
    STORAGE_S3_REGION: z.string().min(1).default('us-east-1'),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    UPLOAD_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    WORKER_ENABLED: booleanFromString,
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.CORS_ORIGINS.includes('*')) {
      context.addIssue({
        code: 'custom',
        message: 'CORS_ORIGINS cannot contain a wildcard in production',
        path: ['CORS_ORIGINS'],
      });
    }
    if (environment.NODE_ENV === 'production') {
      try {
        const appUrl = new URL(environment.APP_URL);
        if (appUrl.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(appUrl.hostname)) {
          context.addIssue({
            code: 'custom',
            message: 'APP_URL must be a public HTTPS origin in production',
            path: ['APP_URL'],
          });
        }
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'APP_URL must be a valid URL',
          path: ['APP_URL'],
        });
      }
      for (const origin of environment.CORS_ORIGINS.split(',').map((value) => value.trim())) {
        try {
          const url = new URL(origin);
          if (url.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)) {
            context.addIssue({
              code: 'custom',
              message: 'CORS_ORIGINS must contain only public HTTPS origins in production',
              path: ['CORS_ORIGINS'],
            });
            break;
          }
        } catch {
          context.addIssue({
            code: 'custom',
            message: 'CORS_ORIGINS contains an invalid origin',
            path: ['CORS_ORIGINS'],
          });
          break;
        }
      }
    }
    if (environment.NODE_ENV === 'production' && !environment.SESSION_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        message: 'SESSION_COOKIE_SECURE must be true in production',
        path: ['SESSION_COOKIE_SECURE'],
      });
    }
    if (environment.NODE_ENV === 'production' && environment.LOG_FORMAT !== 'json') {
      context.addIssue({
        code: 'custom',
        message: 'LOG_FORMAT must be json in production',
        path: ['LOG_FORMAT'],
      });
    }
    if (environment.NODE_ENV === 'production' && environment.EMAIL_DELIVERY_MODE !== 'queue') {
      context.addIssue({
        code: 'custom',
        message: 'EMAIL_DELIVERY_MODE must be queue in production',
        path: ['EMAIL_DELIVERY_MODE'],
      });
    }
    if (environment.EMAIL_TRANSPORT === 'smtp' && !environment.SMTP_HOST) {
      context.addIssue({ code: 'custom', message: 'SMTP_HOST is required', path: ['SMTP_HOST'] });
    }
    if (environment.NODE_ENV === 'production' && environment.EMAIL_TRANSPORT === 'console') {
      context.addIssue({
        code: 'custom',
        message: 'EMAIL_TRANSPORT must be smtp in production',
        path: ['EMAIL_TRANSPORT'],
      });
    }
    if (environment.NODE_ENV === 'production' && environment.STORAGE_DRIVER !== 's3') {
      context.addIssue({
        code: 'custom',
        message: 'STORAGE_DRIVER must be s3 in production',
        path: ['STORAGE_DRIVER'],
      });
    }
    if (environment.STORAGE_DRIVER === 's3') {
      for (const key of [
        'STORAGE_S3_ACCESS_KEY_ID',
        'STORAGE_S3_BUCKET',
        'STORAGE_S3_ENDPOINT',
        'STORAGE_S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: 'custom',
            message: `${key} is required when STORAGE_DRIVER=s3`,
            path: [key],
          });
        }
      }
    }
  });

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const result = environmentSchema.safeParse(config);

  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
  }

  return result.data;
}
