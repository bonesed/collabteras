import 'server-only';

import { unstable_noStore as noStore } from 'next/cache';
import { connection } from 'next/server';
import { cache } from 'react';

import {
  getPlanDefinition,
  getPlanLimits,
  tryResolvePlanTier,
} from '@/lib/plans';
import { reconcileOrganizationSubscription } from '@/lib/stripe/subscription';
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

const UNRESOLVED_LIMITS: PlanLimits = {
  maxStores: 0,
  monthlySearches: 0,
  monthlyProposals: 0,
  maxMembers: 0,
  canExportCsv: false,
};

function planViewFromTier(
  organization: Organization,
  plan: PlanTier,
): OrganizationPlanView {
  return {
    organization: { ...organization, plan },
    limits: getPlanLimits(plan),
    definition: getPlanDefinition(plan),
  };
}

function unresolvedPlanView(organization: Organization): OrganizationPlanView {
  return {
    organization,
    limits: UNRESOLVED_LIMITS,
    definition: {
      tier: organization.plan,
      name: '未設定',
      description: 'プラン情報を取得できませんでした。',
      monthlyPriceJpy: 0,
      limits: UNRESOLVED_LIMITS,
      features: [],
    },
  };
}

function toOrganization(row: Organization): Organization {
  const plan = tryResolvePlanTier(row?.plan);
  return plan === null ? row : { ...row, plan };
}

function emptyOrganization(organizationId: string): Organization {
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

/**
 * 課金画面と同じクエリ: ログインユーザー権限で organizations を SELECT する。
 * Cookie / user_metadata のプラン値は見ない。
 */
async function fetchOrganizationViaUser(
  organizationId: string,
): Promise<Organization | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('organizations')
      .select(ORGANIZATION_COLUMNS)
      .eq('id', organizationId)
      .maybeSingle();

    if (error != null) {
      console.error('組織の取得に失敗しました', error);
      return null;
    }
    if (data == null) {
      return null;
    }

    return toOrganization(data);
  } catch (error) {
    console.error('組織の取得に失敗しました', error);
    return null;
  }
}

/**
 * service role が使えるときだけ、Webhook と同じ経路で最新行を読む。
 * 鍵が無い・失敗しても例外は投げない。
 */
async function fetchOrganizationViaAdmin(
  organizationId: string,
): Promise<Organization | null> {
  try {
    const admin = tryCreateAdminClient();
    if (admin === null) {
      return null;
    }

    const { data, error } = await admin
      .from('organizations')
      .select(ORGANIZATION_COLUMNS)
      .eq('id', organizationId)
      .maybeSingle();

    if (error != null) {
      console.error('admin での組織取得に失敗しました', error);
      return null;
    }
    if (data == null) {
      return null;
    }

    return toOrganization(data);
  } catch (error) {
    console.error('admin での組織取得に失敗しました', error);
    return null;
  }
}

/**
 * organizations.plan の読み取り口。
 * 1. 可能なら service role（Webhook と同じ最新行）
 * 2. だめなら課金画面と同じユーザー権限 SELECT
 */
async function fetchOrganizationRow(
  organizationId: string,
): Promise<Organization | null> {
  try {
    noStore();
  } catch (error) {
    console.error('noStore() に失敗しました', error);
  }
  try {
    await connection();
  } catch (error) {
    console.error('connection() に失敗しました', error);
  }

  const fromAdmin = await fetchOrganizationViaAdmin(organizationId);
  if (fromAdmin != null) {
    return fromAdmin;
  }

  return fetchOrganizationViaUser(organizationId);
}

/**
 * 契約プランの唯一の読み取り口。
 * Stripe Webhook が更新する `organizations.plan` を、キャッシュを介さず都度読む。
 */
export async function getOrganization(
  organizationId: string,
): Promise<Organization> {
  const organization = await fetchOrganizationRow(organizationId);
  if (organization == null) {
    throw new Error('組織が見つかりませんでした。');
  }
  return organization;
}

/**
 * organizations.plan だけを直接 SELECT する。
 * session.user.user_metadata や JWT 上のプラン値は参照しない。
 */
export async function selectOrganizationPlan(
  organizationId: string,
): Promise<PlanTier> {
  const organization = await fetchOrganizationRow(organizationId);
  if (organization == null) {
    throw new Error('組織が見つかりませんでした。');
  }
  const plan = tryResolvePlanTier(organization.plan);
  if (plan === null) {
    throw new Error(`未知のプラン値です: ${organization.plan}`);
  }
  return plan;
}

/**
 * Stripe への問い合わせはリクエスト内で 1 回にまとめる。
 * 失敗しても画面は落とさない。free への引き下げもしない。
 */
const syncPlanFromStripe = cache(async (organizationId: string) => {
  try {
    const organization = await fetchOrganizationRow(organizationId);
    if (organization?.stripe_customer_id == null) {
      return;
    }
    if (tryCreateAdminClient() === null) {
      return;
    }

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
 * 2. 反映後の organizations.plan を読み直す
 */
export async function getOrganizationPlan(
  organizationId: string,
): Promise<OrganizationPlanView> {
  try {
    try {
      noStore();
    } catch (error) {
      console.error('noStore() に失敗しました', error);
    }
    try {
      await connection();
    } catch (error) {
      console.error('connection() に失敗しました', error);
    }

    await syncPlanFromStripe(organizationId);
    const organization = await fetchOrganizationRow(organizationId);
    if (organization == null) {
      return unresolvedPlanView(emptyOrganization(organizationId));
    }
    const plan = tryResolvePlanTier(organization.plan);
    if (plan === null) {
      console.error(`未知のプラン値です: ${organization.plan}`);
      return unresolvedPlanView(organization);
    }

    return planViewFromTier(organization, plan);
  } catch (error) {
    console.error('組織プランの取得に失敗しました', error);
    return unresolvedPlanView(emptyOrganization(organizationId));
  }
}

/**
 * 画面表示用。同期や SELECT に失敗してもページを落とさない。
 * 失敗時に 'free' へ差し替えない（決済済みプランを消さないため）。
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

  const fallbackPlan = tryResolvePlanTier(fallback?.plan);
  if (fallback != null && fallbackPlan !== null) {
    return planViewFromTier(fallback, fallbackPlan);
  }

  try {
    const organization = await fetchOrganizationViaUser(organizationId);
    if (organization !== null) {
      const plan = tryResolvePlanTier(organization.plan);
      if (plan !== null) {
        return planViewFromTier(organization, plan);
      }
      return unresolvedPlanView(organization);
    }
  } catch (error) {
    console.error('ユーザー権限での組織再取得に失敗しました', error);
  }

  if (fallback != null) {
    return unresolvedPlanView(fallback);
  }

  return unresolvedPlanView(emptyOrganization(organizationId));
}
