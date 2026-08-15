import 'server-only';

import { unstable_noStore as noStore } from 'next/cache';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { cache } from 'react';

import {
  getPlanDefinition,
  getPlanLimits,
  resolvePlanTier,
} from '@/lib/plans';
import { healOrganizationPlanFromStripe } from '@/lib/stripe/subscription';
import { createAdminClient } from '@/lib/supabase/admin';
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
 * 認証 Cookie を読み、JWT を PostgREST に載せる。
 * これを省略すると auth.uid() が null になり、RLS で organizations が 0 件になる。
 */
async function bindAuthCookies(): Promise<void> {
  await cookies();
  const supabase = await createClient();
  await supabase.auth.getUser();
}

async function fetchOrganizationRecord(
  organizationId: string,
): Promise<Organization> {
  await bindAuthCookies();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('organizations')
    .select(ORGANIZATION_COLUMNS)
    .eq('id', organizationId)
    .maybeSingle();

  console.log('DB_FETCH_RESULT:', { data, error });

  if (error !== null) {
    throw new Error(`組織の取得に失敗しました: ${error.message}`);
  }
  if (data === null) {
    throw new Error('組織が見つかりませんでした。');
  }

  return asOrganization(data);
}

/**
 * 顧客 ID があるのに plan が free の行は、Webhook が後から消した可能性が高い。
 * Stripe を正として一度だけ書き直し、その結果を返す。
 */
async function fetchOrganizationRecordHealed(
  organizationId: string,
): Promise<Organization> {
  const record = await fetchOrganizationRecord(organizationId);

  const healed = await healOrganizationPlanFromStripe(
    record.id,
    record.stripe_customer_id,
    record.plan,
    record.stripe_subscription_id,
  );

  if (!healed) {
    return record;
  }

  return fetchOrganizationRecord(organizationId);
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

  const record = await fetchOrganizationRecordHealed(organizationId);

  return {
    ...record,
    plan: resolvePlanTier(record.plan),
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
  const organization = await fetchOrganizationRow(organizationId);
  return organization.plan;
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
