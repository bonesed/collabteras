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

/**
 * Stripe Webhook が更新する列と完全一致させる。
 * 書き込み先は `public.organizations.plan`（subscriptions テーブルは存在しない）。
 */
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

function asOrganization(row: Organization): Organization {
  return {
    ...row,
    plan: resolvePlanTier(row.plan),
  };
}

/**
 * Webhook と同じ `organizations.plan` だけを SELECT する。
 * 1. service role（RLS 回避。Webhook の書き込みと同じ経路）
 * 2. だめならログインユーザー権限
 * 'free' へのフォールバックはしない。
 */
const fetchPlanColumn = cache(async function fetchPlanColumn(
  organizationId: string,
): Promise<string> {
  const admin = tryCreateAdminClient();
  if (admin !== null) {
    const { data, error } = await admin
      .from('organizations')
      .select('plan')
      .eq('id', organizationId)
      .maybeSingle();

    if (error !== null) {
      console.error('organizations.plan の service role SELECT に失敗しました', error);
    } else if (data?.plan) {
      return data.plan;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', organizationId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`organizations.plan の取得に失敗しました: ${error.message}`);
  }
  if (data === null || !data.plan) {
    throw new Error(
      'organizations.plan を取得できませんでした。RLS または service role を確認してください。',
    );
  }

  return data.plan;
});

async function fetchOrganizationRecord(
  organizationId: string,
): Promise<Organization> {
  const admin = tryCreateAdminClient();
  if (admin !== null) {
    const { data, error } = await admin
      .from('organizations')
      .select(ORGANIZATION_COLUMNS)
      .eq('id', organizationId)
      .maybeSingle();

    if (error !== null) {
      console.error('organizations の service role SELECT に失敗しました', error);
    } else if (data !== null) {
      return asOrganization(data);
    }
  }

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

  return asOrganization(data);
}

/**
 * organizations 行の読み取り口。
 * plan 列は専用 SELECT で取り直し、他列の失敗で 'free' に落ちないようにする。
 */
const fetchOrganizationRow = cache(async function fetchOrganizationRow(
  organizationId: string,
): Promise<Organization> {
  noStore();
  await connection();

  const [record, plan] = await Promise.all([
    fetchOrganizationRecord(organizationId),
    fetchPlanColumn(organizationId),
  ]);

  return {
    ...record,
    plan: resolvePlanTier(plan),
  };
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
 * `organizations.plan` だけを直接 SELECT する。
 * session.user.user_metadata や JWT 上のプラン値は参照しない。
 */
export async function selectOrganizationPlan(
  organizationId: string,
): Promise<PlanTier> {
  noStore();
  await connection();
  return resolvePlanTier(await fetchPlanColumn(organizationId));
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

  const organization = await fetchOrganizationRecord(organizationId);
  return planViewFromOrganization(organization);
}
