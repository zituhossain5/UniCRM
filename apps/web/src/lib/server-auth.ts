import { cookies, headers } from 'next/headers';
import { env } from './env';
import type { CurrentUser } from './auth-types';

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const demo = requestHeaders.get('x-unicrm-runtime-mode') === 'demo';
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
  if (!cookieHeader) return null;
  try {
    const baseUrl = demo
      ? (process.env.DEMO_API_INTERNAL_URL ?? env.NEXT_PUBLIC_DEMO_API_URL)
      : env.NEXT_PUBLIC_API_URL;
    if (!baseUrl) {
      console.error('Demo server authentication is unavailable: demo API URL is not configured');
      return null;
    }
    const response = await fetch(`${baseUrl}/auth/me`, {
      cache: 'no-store',
      headers: { cookie: cookieHeader },
    });
    if (!response.ok) return null;
    return ((await response.json()) as { data: CurrentUser }).data;
  } catch {
    return null;
  }
}
