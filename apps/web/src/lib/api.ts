import { env } from './env';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export function apiBaseUrl(): string {
  if (typeof window === 'undefined') return env.NEXT_PUBLIC_API_URL;

  const configured = new URL(env.NEXT_PUBLIC_API_URL);
  if (
    process.env.NODE_ENV === 'development' &&
    LOOPBACK_HOSTNAMES.has(configured.hostname) &&
    LOOPBACK_HOSTNAMES.has(window.location.hostname)
  ) {
    configured.hostname = window.location.hostname;
  }

  return configured.toString().replace(/\/$/, '');
}

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${env.NEXT_PUBLIC_CSRF_COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set('content-type', 'application/json');
  const csrf = csrfToken();
  if (csrf && !['GET', 'HEAD'].includes(init.method ?? 'GET'))
    headers.set('x-csrf-token', decodeURIComponent(csrf));

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    let message = 'The request could not be completed.';
    try {
      const payload = (await response.json()) as { message?: string | string[] };
      message = Array.isArray(payload.message)
        ? payload.message.join(', ')
        : (payload.message ?? message);
    } catch {
      // Keep the generic message when an error response has no JSON body.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
