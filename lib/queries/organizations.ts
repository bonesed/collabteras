import 'server-only';

import { unstable_noStore as noStore } from 'next/cache';
import { connection } from 'next/server';
import { cache } from 'react';

import {
  getPlanDefinition,
  getPlanLimits,
  resolvePlanTier,
} from '@/lib/plans';
import { tryCreateAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Organization, PlanDefinition, PlanLimits, PlanTier } from '@/types';

/** organizations テーブルから都度読む列。plan は Cookie / user_metadata を使わない。 */
const ORGANIZATION_COLUMNS =
  'id, name, plan, stripe_customer_id, stripe_subscription_id, current_period_end, created_at, updated_at' as const;

export interface OrganizationPlanView {
  organization: Organization;
  limits: PlanLimits;
  definition: PlanDefinition;
}

function planViewFromOrganization(
  organization: Organization,
): OrganizationPlanView {
  const plan = resolvePlanTier(organization.plan);
  return {
    organization: { ...organization, plan },
    limits: getPlanLimits(plan),
    definition: getPlanDefinition(plan),
  };
}

/**
 * ログインユーザー権限で organizations を SELECT する。
 * Cookie セッションが無いと RLS で 0 件になる。
 */
async function fetchOrganizationViaUser(
  organizationId: string,
): Promise<Organization> {
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
 * service role が使えるときだけ、Webhook と同じ経路で最新行を読む。
 */
async function fetchOrganizationViaAdmin(
  organizationId: string,
): Promise<Organization | null> {
  const admin = tryCreateAdminClient();
  if (admin === null) {
    return null;
  }

  const { data, error } = await admin
    .from('organizations')
    .select(ORGANIZATION_COLUMNS)
    .eq('id', organizationId)
    .maybeSingle();

  if (error !== null || data === null) {
    return null;
  }

  return {
    ...data,
    plan: resolvePlanTier(data.plan),
  };
}

/**
 * organizations.plan の読み取り口。
 * 1. 可能なら service role（Webhook と同じ最新行）
 * 2. だめならログインユーザー権限の SELECT
 * 同一リクエスト内の layout / page から複数回呼ばれるため cache する。
 */
const fetchOrganizationRow = cache(async function fetchOrganizationRow(
  organizationId: string,
): Promise<Organization> {
  noStore();
  await connection();

  const fromAdmin = await fetchOrganizationViaAdmin(organizationId);
  if (fromAdmin !== null) {
    return fromAdmin;
  }

  return fetchOrganizationViaUser(organizationId);
});

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
  return resolvePlanTier(organization.plan);
}

/**
 * 契約プランの読み取り口。
 * Stripe Webhook が更新する `organizations.plan` を DB から都度読む。
 * 画面表示では Stripe API を呼ばない（Vercel の実行時間制限を超えるため）。
 */
export async function getOrganizationPlan(
  organizationId: string,
): Promise<OrganizationPlanView> {
  noStore();
  const organization = await fetchOrganizationRow(organizationId);
  return planViewFromOrganization(organization);
}

/**
 * 画面表示用。同期に失敗しても、渡された組織の plan で続行する。
 * 失敗時に 'free' や「未設定」へ差し替えない（決済済みプランを消さないため）。
 */
export async function getOrganizationPlanSafe(
  organizationId: string,
  fallback?: Organization,
): Promise<OrganizationPlanView> {
  try {
    return await getOrganizationPlan(organizationId);
  } catch (error) {
    console.error('組織プランの取得に失敗しました', error);
  }

  if (fallback != null) {
    return planViewFromOrganization(fallback);
  }

  const organization = await fetchOrganizationViaUser(organizationId);
  return planViewFromOrganization(organization);
}
