import 'server-only';

import { unstable_noStore as noStore } from 'next/cache';
import { connection } from 'next/server';
import { cache } from 'react';

import {
  getPlanDefinition,
  getPlanLimits,
  resolvePlanTier,
} from '@/lib/plans';
import { reconcileOrganizationSubscription } from '@/lib/stripe/subscription';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Organization, PlanDefinition, PlanLimits, PlanTier } from '@/types';

/** organizations テーブルから都度読む列。plan は Cookie / user_metadata を使わない。 */
const ORGANIZATION_COLUMNS =
  'id, name, plan, stripe_customer_id, stripe_subscription_id, current_period_end, created_at, updated_at' as const;

/**
 * Webhook と同じ service role で organizations の最新行を読む。
 * ユーザー JWT / Cookie 上のプラン値は見ない。
 */
async function fetchOrganizationRow(
  organizationId: string,
): Promise<Organization> {
  noStore();
  await connection();

  const admin = createAdminClient();
  const { data, error } = await admin
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
 * 契約プランの唯一の読み取り口。
 * Stripe Webhook が更新する `organizations.plan` を、キャッシュを介さず都度読む。
 */
export async function getOrganization(
  organizationId: string,
): Promise<Organization> {
  return fetchOrganizationRow(organizationId);
}

/**
 * organizations.plan だけを直接 SELECT する。
 * session.user.user_metadata や JWT 上のプラン値は参照しない。
 */
export async function selectOrganizationPlan(
  organizationId: string,
): Promise<PlanTier> {
  const organization = await fetchOrganizationRow(organizationId);
  return organization.plan;
}

/**
 * Stripe への問い合わせはリクエスト内で 1 回にまとめる。
 * DB の再読込はキャッシュしない（課金画面が同期した直後の最新行を拾うため）。
 */
const syncPlanFromStripe = cache(async (organizationId: string) => {
  const organization = await fetchOrganizationRow(organizationId);
  if (organization.stripe_customer_id === null) {
    return;
  }

  try {
    await reconcileOrganizationSubscription(organizationId, undefined, {
      allowDowngrade: false,
    });
  } catch (error) {
    console.error('プラン同期に失敗しました', error);
  }
});

/**
 * 課金画面と同じ手順でプランを確定する。
 * 1. Stripe 顧客がいれば契約を organizations.plan に反映（free への引き下げはしない）
 * 2. 反映後の organizations.plan を service role で読み直す
 */
export async function getOrganizationPlan(organizationId: string): Promise<{
  organization: Organization;
  limits: PlanLimits;
  definition: PlanDefinition;
}> {
  noStore();
  await connection();

  await syncPlanFromStripe(organizationId);
  const organization = await fetchOrganizationRow(organizationId);
  const plan = organization.plan;

  return {
    organization: { ...organization, plan },
    limits: getPlanLimits(plan),
    definition: getPlanDefinition(plan),
  };
}

/**
 * 画面表示用。同期に失敗しても、DB の最新 plan で続行する。
 * 失敗時に 'free' へ差し替えない（決済済みプランを消さないため）。
 */
export async function getOrganizationPlanSafe(
  organizationId: string,
  _fallback?: Organization,
): Promise<{
  organization: Organization;
  limits: PlanLimits;
  definition: PlanDefinition;
}> {
  try {
    return await getOrganizationPlan(organizationId);
  } catch (error) {
    console.error('組織プランの取得に失敗しました', error);
    const organization = await fetchOrganizationRow(organizationId);
    const plan = organization.plan;
    return {
      organization,
      limits: getPlanLimits(plan),
      definition: getPlanDefinition(plan),
    };
  }
}
