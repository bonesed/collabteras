import 'server-only';

import type Stripe from 'stripe';

import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { isPaidPlanTier, planTierForPrice } from '@/lib/stripe/plans';
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
 * Stripe のサブスクリプションの状態を organizations.plan に反映する。
 * 画面が読む列はここだけ。Webhook は順不同・再送があるため、
 * イベント1件ではなく「その顧客の今の契約」から作り直す。
 */
export async function syncSubscription(
  subscription: Stripe.Subscription,
  fallbackOrganizationId?: string | null,
): Promise<void> {
  const organizationId =
    (await resolveOrganizationId(subscription)) ??
    emptyToNull(fallbackOrganizationId);

  if (organizationId === null) {
    console.error(
      `Stripe サブスクリプション ${subscription.id} に対応する組織が見つかりません。`,
    );
    return;
  }

  await reconcileOrganizationSubscription(organizationId, subscription);
}

/**
 * 組織の Stripe 顧客に紐づく契約を引き、organizations.plan を最新化する。
 * Checkout 完了直後（Webhook 遅延時）と Webhook の両方から呼ぶ。
 *
 * `allowDowngrade: false` は Checkout 完了直後用。
 * 契約が一覧にまだ見えない瞬間に free へ戻さない。
 */
export async function reconcileOrganizationSubscription(
  organizationId: string,
  hint?: Stripe.Subscription,
  options?: { allowDowngrade?: boolean },
): Promise<void> {
  const allowDowngrade = options?.allowDowngrade ?? true;
  const admin = createAdminClient();
  const { data: organization, error } = await admin
    .from('organizations')
    .select('id, stripe_customer_id')
    .eq('id', organizationId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`組織の取得に失敗しました: ${error.message}`);
  }
  if (organization === null) {
    throw new Error('組織が見つかりませんでした。');
  }

  const customerId =
    organization.stripe_customer_id ??
    (hint === undefined ? null : customerIdOf(hint));

  let entitled: Stripe.Subscription | null = null;

  if (customerId !== null && isStripeConfigured()) {
    const listed = await getStripe().subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
    });
    entitled = pickEntitledSubscription(listed.data);
  }

  if (entitled === null && hint !== undefined && isEntitled(hint)) {
    entitled = hint;
  }

  if (entitled === null && !allowDowngrade) {
    return;
  }

  await applySubscriptionState(organizationId, entitled);
}

function isEntitled(subscription: Stripe.Subscription): boolean {
  return ENTITLED_STATUSES.includes(subscription.status);
}

function pickEntitledSubscription(
  subscriptions: Stripe.Subscription[],
): Stripe.Subscription | null {
  const entitled = subscriptions.filter(isEntitled);
  if (entitled.length === 0) {
    return null;
  }

  const mapped = entitled.find(
    (subscription) => resolvePlanFromSubscription(subscription) !== null,
  );
  return mapped ?? entitled[0] ?? null;
}

/**
 * Price ID → プラン。対応表に無い価格でも、Checkout 時に書いた
 * metadata.plan_tier があればそれを使う（Price 差し替え後も落ちない）。
 */
function resolvePlanFromSubscription(
  subscription: Stripe.Subscription,
): PlanTier | null {
  const item = subscription.items.data[0];
  if (item !== undefined) {
    const fromPrice = planTierForPrice(item.price.id);
    if (fromPrice !== null) {
      return fromPrice;
    }
  }

  const fromMeta = subscription.metadata.plan_tier;
  if (typeof fromMeta === 'string' && isPaidPlanTier(fromMeta)) {
    return fromMeta;
  }

  return null;
}

function periodEndOf(subscription: Stripe.Subscription): string | null {
  const item = subscription.items.data[0];
  const unix =
    item !== undefined && typeof item.current_period_end === 'number'
      ? item.current_period_end
      : null;

  if (unix === null) {
    return null;
  }

  return new Date(unix * 1000).toISOString();
}

async function applySubscriptionState(
  organizationId: string,
  subscription: Stripe.Subscription | null,
): Promise<void> {
  if (subscription === null || !isEntitled(subscription)) {
    await updateOrganizationBilling(organizationId, {
      plan: 'free',
      stripe_subscription_id: null,
      current_period_end: null,
    });
    return;
  }

  const tier = resolvePlanFromSubscription(subscription);
  const periodEnd = periodEndOf(subscription);

  if (tier === null) {
    // 有効契約があるのに Price が未知。free に戻さず、契約 ID だけ残す。
    console.error(
      `有効なサブスクリプション ${subscription.id} の Price をプランに対応づけられませんでした。plan 列は変更しません。`,
    );
    await updateOrganizationBilling(organizationId, {
      stripe_subscription_id: subscription.id,
      current_period_end: periodEnd,
    });
    return;
  }

  await updateOrganizationBilling(organizationId, {
    plan: tier,
    stripe_subscription_id: subscription.id,
    current_period_end: periodEnd,
  });
}

async function updateOrganizationBilling(
  organizationId: string,
  values: {
    plan?: PlanTier;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
  },
): Promise<void> {
  const { error } = await createAdminClient()
    .from('organizations')
    .update({
      ...values,
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

  const customerId = customerIdOf(subscription);

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

function customerIdOf(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return value;
}
