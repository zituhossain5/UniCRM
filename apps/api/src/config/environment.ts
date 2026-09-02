import { z } from 'zod';

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
    EMAIL_FROM: z.string().min(1).default('UniCRM <noreply@localhost>'),
    EMAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
    INVITATION_TTL_SECONDS: z.coerce.number().int().positive().default(172_800),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    REDIS_URL: z.string().startsWith('redis://'),
    SESSION_COOKIE_NAME: z.string().min(1).default('unicrm_session'),
    SESSION_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
    SMTP_HOST: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().optional(),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.CORS_ORIGINS.includes('*')) {
      context.addIssue({
        code: 'custom',
        message: 'CORS_ORIGINS cannot contain a wildcard in production',
        path: ['CORS_ORIGINS'],
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.SESSION_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        message: 'SESSION_COOKIE_SECURE must be true in production',
        path: ['SESSION_COOKIE_SECURE'],
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
  });

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const result = environmentSchema.safeParse(config);

  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
  }

  return result.data;
}
