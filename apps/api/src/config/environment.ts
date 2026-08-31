import { z } from 'zod';

const environmentSchema = z
  .object({
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().max(65_535).default(4000),
    CORS_ORIGINS: z.string().min(1),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    REDIS_URL: z.string().startsWith('redis://'),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.CORS_ORIGINS.includes('*')) {
      context.addIssue({
        code: 'custom',
        message: 'CORS_ORIGINS cannot contain a wildcard in production',
        path: ['CORS_ORIGINS'],
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
