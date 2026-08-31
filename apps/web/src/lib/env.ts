import { z } from 'zod';

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_CSRF_COOKIE_NAME: z.string().min(1).default('unicrm_csrf'),
});

const parsedEnvironment = publicEnvironmentSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_CSRF_COOKIE_NAME: process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid web environment configuration: ${z.prettifyError(parsedEnvironment.error)}`,
  );
}

export const env = parsedEnvironment.data;
