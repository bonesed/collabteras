import 'server-only';

import { serverEnv } from '@/lib/env';
import type { PlanTier } from '@/types';

/** 課金の対象になるプラン。free は Stripe 上に商品を持たない。 */
export type PaidPlanTier = Exclude<PlanTier, 'free'>;

export const PAID_PLAN_TIERS: readonly PaidPlanTier[] = [
  'light',
  'standard',
  'pro',
];

export function isPaidPlanTier(value: string): value is PaidPlanTier {
  return PAID_PLAN_TIERS.includes(value as PaidPlanTier);
}

/** プランに対応する Price ID。未設定なら null（そのプランは購入できない）。 */
export function priceIdForPlan(tier: PaidPlanTier): string | null {
  const env = serverEnv();
  const priceIdByTier: Record<PaidPlanTier, string | undefined> = {
    light: env.STRIPE_PRICE_ID_LIGHT,
    standard: env.STRIPE_PRICE_ID_STANDARD,
    pro: env.STRIPE_PRICE_ID_PRO,
  };

  return priceIdByTier[tier] ?? null;
}

/**
 * Webhook から受け取った Price ID をプランに戻す。
 * 見覚えのない Price（旧価格や別商品）は null を返し、呼び出し側で無視する。
 */
export function planTierForPrice(priceId: string): PaidPlanTier | null {
  return PAID_PLAN_TIERS.find((tier) => priceIdForPlan(tier) === priceId) ?? null;
}

/** 購入できるプランの一覧。Price ID を設定したものだけが並ぶ。 */
export function purchasablePlanTiers(): PaidPlanTier[] {
  return PAID_PLAN_TIERS.filter((tier) => priceIdForPlan(tier) !== null);
}
