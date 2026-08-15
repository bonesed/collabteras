import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

const STATIC_FILE_PATTERN =
  /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|map|woff2?|ttf|eot|txt|xml|json)$/i;

function shouldBypass(pathname: string): boolean {
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return true;
  }

  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico'
  ) {
    return true;
  }

  return STATIC_FILE_PATTERN.test(pathname);
}

export async function middleware(request: NextRequest) {
  try {
    if (shouldBypass(request.nextUrl.pathname)) {
      return NextResponse.next();
    }

    return await updateSession(request);
  } catch {
    // Edge 上の予期せぬ例外でサイト全体を 500 にしない
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * 静的アセット・画像最適化・/api/* は middleware の対象外。
     * matcher から外しても、上記の早期 return で二重にガードする。
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
