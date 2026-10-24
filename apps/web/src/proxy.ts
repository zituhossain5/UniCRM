import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDemo = pathname === '/demo' || pathname.startsWith('/demo/');
  const hasDemoSession = Boolean(request.cookies.get('unicrm_demo_session')?.value);

  if (pathname.startsWith('/app') && hasDemoSession) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/app(?:\/dashboard)?/, '/demo') || '/demo';
    return NextResponse.redirect(url);
  }
  if (!isDemo) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/demo' ? '/app/dashboard' : pathname.replace(/^\/demo/, '/app');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-unicrm-runtime-mode', 'demo');
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = { matcher: ['/app/:path*', '/demo/:path*', '/demo'] };
