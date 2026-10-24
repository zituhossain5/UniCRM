export type RuntimeRouteDecision = 'normal' | 'demo' | 'redirect-to-demo';

export function runtimeRouteDecision(
  pathname: string,
  sessions: { demo: boolean; normal: boolean },
): RuntimeRouteDecision {
  if (pathname === '/demo' || pathname.startsWith('/demo/')) return 'demo';
  if (pathname.startsWith('/app') && sessions.demo && !sessions.normal) return 'redirect-to-demo';
  return 'normal';
}
