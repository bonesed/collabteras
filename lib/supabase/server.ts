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
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient<Database>(
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
    },
  );
}
