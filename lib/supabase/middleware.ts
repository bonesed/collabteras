import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/auth',
  '/pricing',
  '/legal',
  // Stripe Webhook はセッションを持たず、署名で自身を検証する
  '/api/webhooks',
  '/api/stripe',
];

function isPublicPath(pathname: string): boolean {
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

  const { pathname } = request.nextUrl;

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
