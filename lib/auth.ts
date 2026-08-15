import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getOrganization } from '@/lib/queries/organizations';
import { createClient } from '@/lib/supabase/server';
import type { Organization, Profile, SessionContext } from '@/types';

export const FALLBACK_PROFILE: Profile = {
  id: '',
  email: '',
  full_name: 'ゲスト',
  avatar_url: null,
  created_at: '',
  updated_at: '',
};

function fallbackOrganization(organizationId: string): Organization {
  return {
    id: organizationId,
    name: '',
    plan: 'free',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_end: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Next.js の redirect / notFound は Error として投げられる。握りつぶすと遷移できない。 */
function isNextControlFlowError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) {
    return false;
  }
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))
  );
}

/**
 * ログイン中のプロフィールと「現在の組織」を取得する。
 * 未ログインなら /login、組織未所属なら /onboarding へ送る。
 *
 * 組織の切り替え UI を入れるまでは、所属している最初の組織を現在の組織とみなす。
 */
export const requireSessionContext = cache(async function requireSessionContext(): Promise<SessionContext> {
  const supabase = await createClient();

  let user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null =
    null;
  try {
    const result = await supabase.auth.getUser();
    user = result?.data?.user ?? null;
  } catch (error) {
    console.error('ユーザーの取得に失敗しました', error);
    redirect('/login');
  }

  if (user == null) {
    redirect('/login');
  }

  let profile: Profile | null = null;
  try {
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError != null) {
      console.error('プロフィールの取得に失敗しました', profileError);
    }
    profile = data ?? null;
  } catch (error) {
    console.error('プロフィールの取得に失敗しました', error);
  }

  if (profile == null) {
    const metadataName = user.user_metadata?.full_name;
    profile = {
      id: user.id,
      email: user.email ?? '',
      full_name: typeof metadataName === 'string' ? metadataName : null,
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  let membership: { role: SessionContext['role']; organization_id: string } | null =
    null;
  let membershipQueryFailed = false;
  try {
    const { data, error: membershipError } = await supabase
      .from('organization_members')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError != null) {
      console.error('所属組織の取得に失敗しました', membershipError);
      membershipQueryFailed = true;
    }
    membership = data ?? null;
  } catch (error) {
    console.error('所属組織の取得に失敗しました', error);
    membershipQueryFailed = true;
  }

  if (membership == null && membershipQueryFailed) {
    throw new Error('所属組織の取得に失敗しました。');
  }

  if (membership == null) {
    redirect('/onboarding');
  }

  let organization: Organization;
  try {
    organization = await getOrganization(membership.organization_id);
  } catch (error) {
    console.error('所属組織の詳細取得に失敗しました', error);
    organization = fallbackOrganization(membership.organization_id);
  }

  return {
    profile,
    organization,
    role: membership.role ?? 'member',
  };
});

/**
 * 画面用。認証リダイレクト以外の失敗では null を返し、ページを落とさない。
 */
export async function getSessionContextSafe(): Promise<SessionContext | null> {
  try {
    return await requireSessionContext();
  } catch (error) {
    if (isNextControlFlowError(error)) {
      throw error;
    }
    console.error('セッションの取得に失敗しました', error);
    return null;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user } = { user: null },
    } = (await supabase.auth.getUser()) ?? { data: { user: null } };
    return user?.id ?? null;
  } catch (error) {
    console.error('ユーザー ID の取得に失敗しました', error);
    return null;
  }
}
