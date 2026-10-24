import { z } from 'zod';

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.union([z.url(), z.string().regex(/^\//)]),
  NEXT_PUBLIC_CSRF_COOKIE_NAME: z.string().min(1).default('unicrm_csrf'),
  NEXT_PUBLIC_DEMO_API_URL: z.union([z.url(), z.string().regex(/^\//)]).optional(),
  NEXT_PUBLIC_DEMO_CSRF_COOKIE_NAME: z.string().min(1).default('unicrm_demo_csrf'),
  NEXT_PUBLIC_DEMO_CONTACT_URL: z.union([z.url(), z.string().regex(/^mailto:/)]).optional(),
  NEXT_PUBLIC_DEMO_TURNSTILE_SITE_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
});

const parsedEnvironment = publicEnvironmentSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_CSRF_COOKIE_NAME: process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME,
  NEXT_PUBLIC_DEMO_API_URL: process.env.NEXT_PUBLIC_DEMO_API_URL,
  NEXT_PUBLIC_DEMO_CSRF_COOKIE_NAME: process.env.NEXT_PUBLIC_DEMO_CSRF_COOKIE_NAME,
  NEXT_PUBLIC_DEMO_CONTACT_URL: process.env.NEXT_PUBLIC_DEMO_CONTACT_URL,
  NEXT_PUBLIC_DEMO_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_DEMO_TURNSTILE_SITE_KEY,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid web environment configuration: ${z.prettifyError(parsedEnvironment.error)}`,
  );
}

export const env = parsedEnvironment.data;
