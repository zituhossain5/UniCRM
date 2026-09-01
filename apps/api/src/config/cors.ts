import type { EnvironmentVariables } from './environment';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export function allowedCorsOrigins(
  configuredOrigins: string,
  nodeEnvironment: EnvironmentVariables['NODE_ENV'],
): string[] {
  const origins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (nodeEnvironment !== 'development') return origins;

  const expanded = new Set(origins);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!LOOPBACK_HOSTNAMES.has(url.hostname)) continue;

      url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      expanded.add(url.origin);
    } catch {
      // Environment validation and CORS will reject unusable origins elsewhere.
    }
  }

  return [...expanded];
}
