import 'server-only';

import { PLANS } from '@/lib/constants';
import { planTierForPrice } from '@/lib/stripe/plans';
import type { PlanDefinition, PlanLimits, PlanTier } from '@/types';

export const PLAN_TIERS: readonly PlanTier[] = [
  'free',
  'light',
  'standard',
  'pro',
];

/** プランごとの上限。PLANS から導出し、定義の二重管理を避ける。 */
export const PLAN_LIMITS: Readonly<Record<PlanTier, PlanLimits>> = {
  free: PLANS.free.limits,
  light: PLANS.light.limits,
  standard: PLANS.standard.limits,
  pro: PLANS.pro.limits,
};

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

/**
 * DB の plan 列・旧名称・Stripe Price ID を PlanTier に正規化する。
 * 未知の値を 'free' に置き換えない（決済済みプランが消えるため）。
 */
export function resolvePlanTier(
  value: string | null | undefined,
): PlanTier {
  if (value == null || value === '') {
    throw new Error('organizations.plan が空です。');
  }

  if (isPlanTier(value)) {
    return value;
  }

  // 0002_plan_tiers 以前の enum 値。リネーム前の行が残っていても light として扱う。
  if (value === 'starter') {
    return 'light';
  }

  const fromPrice = planTierForPrice(value);
  if (fromPrice !== null) {
    return fromPrice;
  }

  throw new Error(`未知のプラン値です: ${value}`);
}

export function getPlanDefinition(
  planValue: string | null | undefined,
): PlanDefinition {
  return PLANS[resolvePlanTier(planValue)];
}

export function getPlanLimits(
  planValue: string | null | undefined,
): PlanLimits {
  return PLAN_LIMITS[resolvePlanTier(planValue)];
}

/** CSV 一括出力はプロプランのみ。 */
export function canExportCsv(planValue: string): boolean {
  return getPlanLimits(planValue).canExportCsv;
}
