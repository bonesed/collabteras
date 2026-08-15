import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export async function middleware(request: NextRequest) {
  // /api/*（Stripe Webhook 含む）は認証・セッション更新・リダイレクトを一切行わない
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 静的アセット・画像最適化・/api/* は middleware の対象外。
     * /api 配下（Stripe Webhook など）はセッションを持たず署名で自身を検証する。
     * matcher から外しても、上記の早期 return で二重にガードする。
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
