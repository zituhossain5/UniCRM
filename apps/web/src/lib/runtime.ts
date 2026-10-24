export type RuntimeMode = 'NORMAL' | 'DEMO';

export function runtimeModeFromPath(pathname?: string): RuntimeMode {
  const path = pathname ?? (typeof window === 'undefined' ? '' : window.location.pathname);
  return path === '/demo' || path.startsWith('/demo/') ? 'DEMO' : 'NORMAL';
}

export function toRuntimePath(path: string, mode = runtimeModeFromPath()): string {
  if (mode !== 'DEMO' || !path.startsWith('/app')) return path;
  return path.replace(/^\/app(?:\/dashboard)?/, '/demo') || '/demo';
}
