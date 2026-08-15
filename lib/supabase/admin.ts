import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * RLS を迂回する管理用クライアント。
 * Stripe Webhook など「ログインユーザーが存在しない文脈」でのみ使うこと。
 * ユーザー起点の処理では絶対に使わない。
 */
export function createAdminClient() {
  // `process.env.SUPABASE_SERVICE_ROLE_KEY` を直接読む。
  // serverEnv() 経由だと、Next.js の env 置換漏れで undefined になることがある。
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (serviceRoleKey === undefined || serviceRoleKey === '') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY が設定されていません。Stripe Webhook などの管理操作に必要です。',
    );
  }

  return createSupabaseClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );
}

/**
 * service role が無い・環境変数の検証に失敗しても、画面を落とさない。
 * Webhook 以外の読み取りではこちらを使う。
 */
export function tryCreateAdminClient() {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (serviceRoleKey === undefined || serviceRoleKey === '') {
      return null;
    }
    return createAdminClient();
  } catch (error) {
    console.error('Admin クライアントを初期化できません', error);
    return null;
  }
}
