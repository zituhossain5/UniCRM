import { NextResponse, type NextRequest } from 'next/server';
import { runtimeRouteDecision } from '@/lib/runtime-routing';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasDemoSession = Boolean(request.cookies.get('unicrm_demo_session')?.value);
  const hasNormalSession = Boolean(request.cookies.get('unicrm_session')?.value);
  const decision = runtimeRouteDecision(pathname, {
    demo: hasDemoSession,
    normal: hasNormalSession,
  });

  if (decision === 'redirect-to-demo') {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/app(?:\/dashboard)?/, '/demo') || '/demo';
    return NextResponse.redirect(url);
  }
  if (decision !== 'demo') return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/demo' ? '/app/dashboard' : pathname.replace(/^\/demo/, '/app');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-unicrm-runtime-mode', 'demo');
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = { matcher: ['/app/:path*', '/demo/:path*', '/demo'] };
