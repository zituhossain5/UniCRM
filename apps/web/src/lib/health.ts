import type { HealthResponse } from '@unicrm/types';
import { z } from 'zod';
import { env } from './env';

const healthResponseSchema = z.object({
  services: z.object({
    api: z.literal('connected'),
    database: z.enum(['connected', 'disconnected']),
    redis: z.enum(['connected', 'disconnected']),
  }),
  status: z.enum(['ok', 'degraded']),
  timestamp: z.iso.datetime(),
});

export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      return null;
    }

    return healthResponseSchema.parse(await response.json());
  } catch {
    return null;
  }
}
