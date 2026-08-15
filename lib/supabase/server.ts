import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Server Component / Server Action / Route Handler から使うクライアント。
 * RLS を効かせるため、通常のデータアクセスは必ずこちらを経由する。
 *
 * `cookies()` の失敗を握りつぶすと空 Cookie でクライアントが作られ、
 * ログイン済みユーザーが未認証として扱われる。ここでの try-catch は禁止。
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component からは Cookie を書けない。セッション更新は
            // middleware 側で行っているため、ここでは無視してよい。
          }
        },
      },
      // Next.js の Data Cache が PostgREST の GET を使い回すと、
      // Stripe Webhook で更新したプランが画面に残る。常に最新を取る。
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );

  // Cookie 上の JWT を Authorization に載せる。
  // これを呼ばないと PostgREST の auth.uid() が null になり、RLS で 0 件になる。
  await supabase.auth.getUser();

  return supabase;
}
