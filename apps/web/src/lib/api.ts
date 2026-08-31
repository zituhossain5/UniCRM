import { env } from './env';

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
  if (init.body) headers.set('content-type', 'application/json');
  const csrf = csrfToken();
  if (csrf && !['GET', 'HEAD'].includes(init.method ?? 'GET'))
    headers.set('x-csrf-token', decodeURIComponent(csrf));

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
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
