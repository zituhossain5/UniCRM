import { cookies } from 'next/headers';
import { env } from './env';
import type { CurrentUser } from './auth-types';

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
  if (!cookieHeader) return null;
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/auth/me`, {
      cache: 'no-store',
      headers: { cookie: cookieHeader },
    });
    if (!response.ok) return null;
    return ((await response.json()) as { data: CurrentUser }).data;
  } catch {
    return null;
  }
}
