import 'server-only';

import type Stripe from 'stripe';

import { planTierForPrice } from '@/lib/stripe/plans';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PlanTier } from '@/types';

/**
 * 支払いが遅れている間（past_due）は機能を止めず、猶予として扱う。
 * 実際に止まるのは Stripe 側でサブスクリプションが終了したときだけ。
 */
const ENTITLED_STATUSES: readonly Stripe.Subscription.Status[] = [
  'active',
  'trialing',
  'past_due',
];

/**
 * Stripe のサブスクリプションの状態を organizations に反映する。
 * Webhook は順不同で届くうえ再送もあるため、常に「今の状態」から作り直す。
 */
export async function syncSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const organizationId = await resolveOrganizationId(subscription);

  if (organizationId === null) {
    console.error(
      `Stripe サブスクリプション ${subscription.id} に対応する組織が見つかりません。`,
    );
    return;
  }

  // 期間の終わりは Basil 以降サブスクリプション項目側に移っている。
  const item = subscription.items.data[0];
  const tier = item === undefined ? null : planTierForPrice(item.price.id);
  const isEntitled =
    tier !== null && ENTITLED_STATUSES.includes(subscription.status);

  const plan: PlanTier = isEntitled ? tier : 'free';

  const { error } = await createAdminClient()
    .from('organizations')
    .update({
      plan,
      stripe_subscription_id: isEntitled ? subscription.id : null,
      current_period_end:
        isEntitled && item !== undefined
          ? new Date(item.current_period_end * 1000).toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error !== null) {
    throw new Error(`組織のプラン更新に失敗しました: ${error.message}`);
  }
}

/**
 * Checkout 経由なら metadata に組織 ID が入っている。
 * Stripe ダッシュボードから直接作られた場合に備え、顧客 ID からも引けるようにする。
 */
async function resolveOrganizationId(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMetadata = subscription.metadata.organization_id;
  if (typeof fromMetadata === 'string' && fromMetadata !== '') {
    return fromMetadata;
  }

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const { data, error } = await createAdminClient()
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`組織の特定に失敗しました: ${error.message}`);
  }

  return data?.id ?? null;
}
