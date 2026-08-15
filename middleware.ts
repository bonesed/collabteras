import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 静的アセットと画像最適化のリクエストは除外する。
     * /api/ 配下（Stripe Webhook など）はセッションを持たず署名で自身を検証するため、
     * ここを通すとログイン画面へ飛ばされてしまう。
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
