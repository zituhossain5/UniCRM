import { z } from 'zod';

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
});

const parsedEnvironment = publicEnvironmentSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid web environment configuration: ${z.prettifyError(parsedEnvironment.error)}`,
  );
}

export const env = parsedEnvironment.data;
