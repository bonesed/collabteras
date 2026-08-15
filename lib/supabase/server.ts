import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Server Component / Server Action / Route Handler から使うクライアント。
 * RLS を効かせるため、通常のデータアクセスは必ずこちらを経由する。
 */
export async function createClient() {
  const env = publicEnv();

  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
  } catch (error) {
    // Server Component 以外や Cookie が読めない文脈でもクライアント生成は続ける。
    console.error('Cookie の取得に失敗しました', error);
  }

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          try {
            return cookieStore?.getAll() ?? [];
          } catch (error) {
            console.error('Cookie の読み取りに失敗しました', error);
            return [];
          }
        },
        setAll(cookiesToSet) {
          try {
            if (cookieStore == null) {
              return;
            }
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
}
