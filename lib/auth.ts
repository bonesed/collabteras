import 'server-only';

import { redirect } from 'next/navigation';

import { getOrganization } from '@/lib/queries/organizations';
import { createClient } from '@/lib/supabase/server';
import type { SessionContext } from '@/types';

/**
 * ログイン中のプロフィールと「現在の組織」を取得する。
 * 未ログインなら /login、組織未所属なら /onboarding へ送る。
 *
 * 組織の切り替え UI を入れるまでは、所属している最初の組織を現在の組織とみなす。
 */
export async function requireSessionContext(): Promise<SessionContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // ここで /login に送ると、ログイン済みの middleware に押し戻されて往復する。
  // プロフィールが引けないのは設定不備なので、原因が分かる形で落とす。
  if (profileError !== null) {
    throw new Error(`プロフィールの取得に失敗しました: ${profileError.message}`);
  }

  if (profile === null) {
    throw new Error(
      'プロフィールが作成されていません。auth.users への on_auth_user_created トリガーが有効か確認してください。',
    );
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError !== null) {
    throw new Error(`所属組織の取得に失敗しました: ${membershipError.message}`);
  }

  if (membership === null) {
    redirect('/onboarding');
  }

  // プランは organizations テーブルの plan 列を都度読む。user_metadata は使わない。
  const organization = await getOrganization(membership.organization_id);

  return {
    profile,
    organization,
    role: membership.role,
  };
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
