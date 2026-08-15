import 'server-only';

import {
  getPlanDefinition,
  getPlanLimits,
  resolvePlanTier,
} from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import type { Organization, PlanDefinition, PlanLimits } from '@/types';

/**
 * 組織を organizations テーブルから直接取得する。
 * 所属の入れ子取得に頼らず、Webhook 反映後の最新プランを読む。
 */
export async function getOrganization(
  organizationId: string,
): Promise<Organization> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
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
 * 組織の最新プランと、そこから導いた上限・定義をまとめて返す。
 * 店舗登録・近隣抽出・提案文生成・CSV 出力の判定は必ずここを通す。
 */
export async function getOrganizationPlan(organizationId: string): Promise<{
  organization: Organization;
  limits: PlanLimits;
  definition: PlanDefinition;
}> {
  const organization = await getOrganization(organizationId);

  try {
    return {
      organization,
      limits: getPlanLimits(organization.plan),
      definition: getPlanDefinition(organization.plan),
    };
  } catch (error) {
    console.error('プラン上限の算出に失敗しました', error);
    return {
      organization,
      limits: getPlanLimits('free'),
      definition: getPlanDefinition('free'),
    };
  }
}

/**
 * 画面表示用。組織・プランの取得に失敗しても free 相当で続行する。
 * ページ全体を落とさないためのフォールバック。
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
