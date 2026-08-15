import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/auth', '/pricing', '/legal'];

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isPublicPath(pathname: string): boolean {
  if (isApiPath(pathname)) {
    return true;
  }

  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * セッション Cookie のリフレッシュと、未ログイン時のリダイレクトを行う。
 * `supabase.auth.getUser()` の呼び出しがトークン更新のトリガーになるため、
 * ここで必ず 1 回呼ぶ。
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/* は認証チェックも Cookie 更新も行わず、リダイレクトしない
  if (isApiPath(pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect_to', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user !== null && (pathname === '/login' || pathname === '/signup')) {
    const requested = request.nextUrl.searchParams.get('redirect_to');
    const destination =
      requested !== null && requested.startsWith('/') && !requested.startsWith('//')
        ? requested
        : '/dashboard';

    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = destination;
    nextUrl.search = '';
    return NextResponse.redirect(nextUrl);
  }

  return response;
}
