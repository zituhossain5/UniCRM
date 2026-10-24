import type { RuntimeMode } from './runtime';

export interface ApiBaseUrls {
  normal: string;
  demo?: string;
}

function normalizeBaseUrl(value: string, variableName: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error(`${variableName} is required`);
  return normalized;
}

export function configuredApiBaseUrl(mode: RuntimeMode, urls: ApiBaseUrls): string {
  if (mode === 'DEMO') {
    if (!urls.demo) throw new Error('NEXT_PUBLIC_DEMO_API_URL is required for demo mode');
    return normalizeBaseUrl(urls.demo, 'NEXT_PUBLIC_DEMO_API_URL');
  }
  return normalizeBaseUrl(urls.normal, 'NEXT_PUBLIC_API_URL');
}

export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function configuredApiUrl(mode: RuntimeMode, path: string, urls: ApiBaseUrls): string {
  return joinApiUrl(configuredApiBaseUrl(mode, urls), path);
}
