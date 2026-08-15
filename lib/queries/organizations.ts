import 'server-only';

import { unstable_noStore as noStore } from 'next/cache';
import { connection } from 'next/server';

import {
  getPlanDefinition,
  getPlanLimits,
  resolvePlanTier,
} from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import type { Organization, PlanDefinition, PlanLimits, PlanTier } from '@/types';

/** organizations テーブルから都度読む列。plan は Cookie / user_metadata を使わない。 */
const ORGANIZATION_COLUMNS =
  'id, name, plan, stripe_customer_id, stripe_subscription_id, current_period_end, created_at, updated_at' as const;

/**
 * 契約プランの唯一の読み取り口。
 * Stripe Webhook が更新する `organizations.plan` を、キャッシュを介さず都度読む。
 */
export async function getOrganization(
  organizationId: string,
): Promise<Organization> {
  noStore();
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    .select(ORGANIZATION_COLUMNS)
    .eq('id', organizationId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`組織の取得に失敗しました: ${error.message}`);
  }
  if (data === null) {
    throw new Error('組織が見つかりませんでした。');
  }

  return {
    ...data,
    plan: resolvePlanTier(data.plan),
  };
}

/**
 * organizations.plan だけを直接 SELECT する。
 * session.user.user_metadata や JWT 上のプラン値は参照しない。
 */
export async function selectOrganizationPlan(
  organizationId: string,
): Promise<PlanTier> {
  noStore();
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', organizationId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`プランの取得に失敗しました: ${error.message}`);
  }
  if (data === null) {
    throw new Error('組織が見つかりませんでした。');
  }

  return resolvePlanTier(data.plan);
}

/**
 * 組織の最新プランと、そこから導いた上限・定義をまとめて返す。
 * 店舗登録・近隣抽出・提案文生成・CSV 出力の判定は必ずここを通す。
 */
export async function getOrganizationPlan(organizationId: string): Promise<{
  organization: Organization;
  limits: PlanLimits;
  definition: PlanDefinition;
}> {
  noStore();
  await connection();

  const [organization, plan] = await Promise.all([
    getOrganization(organizationId),
    selectOrganizationPlan(organizationId),
  ]);

  try {
    return {
      organization: { ...organization, plan },
      limits: getPlanLimits(plan),
      definition: getPlanDefinition(plan),
    };
  } catch (error) {
    console.error('プラン上限の算出に失敗しました', error);
    return {
      organization: { ...organization, plan },
      limits: getPlanLimits(plan),
      definition: getPlanDefinition(plan),
    };
  }
}

/**
 * 画面表示用。組織・プランの取得に失敗しても、渡された組織の plan で続行する。
 * 失敗時に 'free' へ差し替えない（決済済みプランを消さないため）。
 */
export async function getOrganizationPlanSafe(
  organizationId: string,
  fallback: Organization,
): Promise<{
  organization: Organization;
  limits: PlanLimits;
  definition: PlanDefinition;
}> {
  try {
    return await getOrganizationPlan(organizationId);
  } catch (error) {
    console.error('組織プランの取得に失敗しました', error);
    return {
      organization: fallback,
      limits: getPlanLimits(fallback.plan),
      definition: getPlanDefinition(fallback.plan),
    };
  }
}
