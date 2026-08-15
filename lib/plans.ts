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
 * 見覚えのない値や null は free に倒し、PLANS[unknown] で落ちないようにする。
 */
export function resolvePlanTier(
  value: string | null | undefined,
): PlanTier {
  if (value == null || value === '') {
    return 'free';
  }

  if (isPlanTier(value)) {
    return value;
  }

  // 0002_plan_tiers 以前の enum 値。リネーム前の行が残っていても light として扱う。
  if (value === 'starter') {
    return 'light';
  }

  try {
    return planTierForPrice(value) ?? 'free';
  } catch {
    return 'free';
  }
}

export function getPlanDefinition(
  planValue: string | null | undefined,
): PlanDefinition {
  try {
    return PLANS[resolvePlanTier(planValue)] ?? PLANS.free;
  } catch {
    return PLANS.free;
  }
}

export function getPlanLimits(
  planValue: string | null | undefined,
): PlanLimits {
  try {
    return PLAN_LIMITS[resolvePlanTier(planValue)] ?? PLAN_LIMITS.free;
  } catch {
    return PLAN_LIMITS.free;
  }
}

/** CSV 一括出力はプロプランのみ。 */
export function canExportCsv(planValue: string): boolean {
  return getPlanLimits(planValue).canExportCsv;
}
