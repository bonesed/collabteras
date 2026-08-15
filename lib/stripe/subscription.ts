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

/** 契約が確定的に終わったときだけ free へ戻す。incomplete では消さない。 */
const TERMINAL_STATUSES: readonly Stripe.Subscription.Status[] = [
  'canceled',
  'unpaid',
  'incomplete_expired',
];

const ORGANIZATION_BILLING_COLUMNS =
  'id, plan, stripe_customer_id, stripe_subscription_id, current_period_end' as const;

export interface SyncSubscriptionOptions {
  allowDowngrade?: boolean;
  planTierHint?: string | null;
}

/**
 * Stripe のサブスクリプションを organizations に上書き保存する。
 * 書き込み先は `public.organizations` のみ（subscriptions テーブルは無い）。
 *
 * 決済完了系イベントでは、契約が終了ステータスでない限り
 * plan / stripe_subscription_id を必ず UPDATE する。
 */
export async function syncSubscription(
  subscription: Stripe.Subscription,
  fallbackOrganizationId?: string | null,
  options?: SyncSubscriptionOptions,
): Promise<void> {
  const allowDowngrade = options?.allowDowngrade ?? false;
  const plan = resolvePlanFromSubscription(subscription, options?.planTierHint);
  const customerId = customerIdOf(subscription);

  console.log('STRIPE_SYNC_START:', {
    subscriptionId: subscription.id,
    status: subscription.status,
    customerId,
    fallbackOrganizationId: fallbackOrganizationId ?? null,
    metadata: subscription.metadata,
    priceId: subscription.items.data[0]?.price.id ?? null,
    resolvedPlan: plan,
    allowDowngrade,
    isEntitled: isEntitled(subscription),
    isTerminal: isTerminal(subscription),
  });

  if (isTerminal(subscription) && allowDowngrade) {
    const organizationId =
      (await resolveOrganizationId(subscription)) ??
      emptyToNull(fallbackOrganizationId);

    if (organizationId === null) {
      throw new Error(
        `終了イベントの組織が見つかりません。subscription=${subscription.id} customer=${customerId}`,
      );
    }

    await reconcileOrganizationSubscription(organizationId, subscription, {
      ...options,
      allowDowngrade: true,
    });
    return;
  }

  // checkout.session.completed / subscription.created など。
  // 一覧 API の遅延や incomplete を待たず、受け取った契約で上書きする。
  await persistPaidSubscription(subscription, fallbackOrganizationId, plan);
}

/**
 * 組織の Stripe 顧客に紐づく契約を引き、organizations.plan を最新化する。
 * Checkout 完了直後（Webhook 遅延時）と Webhook の両方から呼ぶ。
 *
 * `allowDowngrade: false` は Checkout 完了直後・画面自己修復用。
 * 契約が一覧にまだ見えない瞬間に free へ戻さない。
 */
export async function reconcileOrganizationSubscription(
  organizationId: string,
  hint?: Stripe.Subscription,
  options?: SyncSubscriptionOptions,
): Promise<void> {
  const allowDowngrade = options?.allowDowngrade ?? false;
  const admin = createAdminClient();
  const { data: organization, error } = await admin
    .from('organizations')
    .select(ORGANIZATION_BILLING_COLUMNS)
    .eq('id', organizationId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`組織の取得に失敗しました: ${error.message}`);
  }
  if (organization === null) {
    throw new Error(`組織が見つかりませんでした。id=${organizationId}`);
  }

  const customerId =
    organization.stripe_customer_id ??
    (hint === undefined ? null : customerIdOf(hint));

  let entitled: Stripe.Subscription | null = null;
  let listedCount = 0;

  if (customerId !== null && isStripeConfigured()) {
    const listed = await getStripe().subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
    });
    listedCount = listed.data.length;
    entitled = pickEntitledSubscription(listed.data);
  }

  const toPersist =
    entitled ??
    (hint !== undefined && !isTerminal(hint) ? hint : null);

  const resolvedPlan =
    toPersist !== null
      ? resolvePlanFromSubscription(toPersist, options?.planTierHint)
      : null;

  console.log('STRIPE_RECONCILE:', {
    organizationId,
    customerId,
    currentPlan: organization.plan,
    currentSubscriptionId: organization.stripe_subscription_id,
    listedCount,
    entitledId: entitled?.id ?? null,
    entitledStatus: entitled?.status ?? null,
    hintId: hint?.id ?? null,
    hintStatus: hint?.status ?? null,
    toPersistId: toPersist?.id ?? null,
    resolvedPlan,
    allowDowngrade,
  });

  if (toPersist !== null) {
    await persistPaidSubscription(toPersist, organizationId, resolvedPlan);
    return;
  }

  if (!allowDowngrade) {
    console.warn(
      'STRIPE_RECONCILE: 有効契約が見つからないため plan は変更しません',
      { organizationId, currentPlan: organization.plan },
    );
    return;
  }

  if (
    hint !== undefined &&
    isTerminal(hint) &&
    organization.stripe_subscription_id !== null &&
    hint.id !== organization.stripe_subscription_id
  ) {
    console.warn(
      'STRIPE_RECONCILE: 別契約の終了イベントのため plan は変更しません',
      { hintId: hint.id, kept: organization.stripe_subscription_id },
    );
    return;
  }

  await updateOrganizationBilling({
    match: { id: organizationId },
    values: {
      plan: 'free',
      stripe_subscription_id: null,
      current_period_end: null,
    },
  });
}

/**
 * 顧客 ID があるのに plan が free / 契約 ID が空のとき、Stripe を正として書き直す。
 * ダウングレードはしない。Webhook が free に戻した行の自己修復用。
 */
export async function healOrganizationPlanFromStripe(
  organizationId: string,
  stripeCustomerId: string | null,
  currentPlan: string,
  stripeSubscriptionId: string | null,
): Promise<boolean> {
  if (!isStripeConfigured() || stripeCustomerId === null) {
    return false;
  }

  const looksInconsistent =
    currentPlan === 'free' || stripeSubscriptionId === null;
  if (!looksInconsistent) {
    return false;
  }

  await reconcileOrganizationSubscription(organizationId, undefined, {
    allowDowngrade: false,
  });
  return true;
}

/**
 * 決済済み（または決済進行中）の契約を organizations に上書き保存する。
 * 主キーは stripe_customer_id。未保存なら organization_id で特定して顧客 ID も書く。
 */
async function persistPaidSubscription(
  subscription: Stripe.Subscription,
  fallbackOrganizationId: string | null | undefined,
  plan: PlanTier | null,
): Promise<void> {
  const customerId = customerIdOf(subscription);
  const admin = createAdminClient();

  console.log('STRIPE_ORG_LOOKUP:', {
    customerId,
    fallbackOrganizationId: fallbackOrganizationId ?? null,
    metadataOrganizationId: subscription.metadata.organization_id ?? null,
  });

  const byCustomer = await admin
    .from('organizations')
    .select(ORGANIZATION_BILLING_COLUMNS)
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  console.log('STRIPE_ORG_BY_CUSTOMER:', {
    customerId,
    data: byCustomer.data,
    error: byCustomer.error,
  });

  if (byCustomer.error !== null) {
    throw new Error(
      `stripe_customer_id での組織検索に失敗しました: ${byCustomer.error.message}`,
    );
  }

  let organization = byCustomer.data;
  let match: { stripe_customer_id: string } | { id: string } = {
    stripe_customer_id: customerId,
  };

  if (organization === null) {
    const orgId =
      emptyToNull(subscription.metadata.organization_id) ??
      emptyToNull(fallbackOrganizationId);

    if (orgId === null) {
      throw new Error(
        `組織が見つかりません。stripe_customer_id=${customerId} subscription=${subscription.id}`,
      );
    }

    const byId = await admin
      .from('organizations')
      .select(ORGANIZATION_BILLING_COLUMNS)
      .eq('id', orgId)
      .maybeSingle();

    console.log('STRIPE_ORG_BY_ID:', {
      orgId,
      data: byId.data,
      error: byId.error,
    });

    if (byId.error !== null) {
      throw new Error(`組織IDでの検索に失敗しました: ${byId.error.message}`);
    }
    if (byId.data === null) {
      throw new Error(`組織 ${orgId} が存在しません。`);
    }

    organization = byId.data;
    match = { id: orgId };
  }

  if (plan === null) {
    console.error(
      'STRIPE_PLAN_UNRESOLVED: Price / metadata からプランを特定できません。契約 ID のみ保存します。',
      {
        subscriptionId: subscription.id,
        priceId: subscription.items.data[0]?.price.id ?? null,
        metadata: subscription.metadata,
        currentPlan: organization.plan,
      },
    );
  }

  await updateOrganizationBilling({
    match,
    values: {
      plan: plan ?? undefined,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      current_period_end: periodEndOf(subscription),
    },
  });
}

function isEntitled(subscription: Stripe.Subscription): boolean {
  return ENTITLED_STATUSES.includes(subscription.status);
}

function isTerminal(subscription: Stripe.Subscription): boolean {
  return TERMINAL_STATUSES.includes(subscription.status);
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
  planTierHint?: string | null,
): PlanTier | null {
  if (typeof planTierHint === 'string' && isPaidPlanTier(planTierHint)) {
    return planTierHint;
  }

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
  const fromItem =
    item !== undefined && typeof item.current_period_end === 'number'
      ? item.current_period_end
      : null;

  const legacy = (subscription as { current_period_end?: number })
    .current_period_end;
  const fromSubscription = typeof legacy === 'number' ? legacy : null;

  const unix = fromItem ?? fromSubscription;
  if (unix === null) {
    return null;
  }

  return new Date(unix * 1000).toISOString();
}

async function updateOrganizationBilling(input: {
  match: { id: string } | { stripe_customer_id: string };
  values: {
    plan?: PlanTier;
    stripe_customer_id?: string;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
  };
}): Promise<void> {
  const payload = {
    ...input.values,
    updated_at: new Date().toISOString(),
  };

  console.log('ORG_BILLING_UPDATE:', { match: input.match, values: payload });

  const admin = createAdminClient();
  let query = admin.from('organizations').update(payload);

  if ('id' in input.match) {
    query = query.eq('id', input.match.id);
  } else {
    query = query.eq('stripe_customer_id', input.match.stripe_customer_id);
  }

  const { data, error } = await query
    .select(ORGANIZATION_BILLING_COLUMNS)
    .maybeSingle();

  console.log('ORG_BILLING_UPDATE_RESULT:', { data, error });

  if (error !== null) {
    throw new Error(`組織のプラン更新に失敗しました: ${error.message}`);
  }
  if (data === null) {
    throw new Error(
      `organizations の更新が 0 件でした。match=${JSON.stringify(input.match)}`,
    );
  }
}

/**
 * stripe_customer_id を優先し、無ければ metadata / Checkout の組織 ID で引く。
 */
async function resolveOrganizationId(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const customerId = customerIdOf(subscription);

  const { data, error } = await createAdminClient()
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  console.log('STRIPE_RESOLVE_ORG:', {
    customerId,
    metadataOrganizationId: subscription.metadata.organization_id ?? null,
    data,
    error,
  });

  if (error !== null) {
    throw new Error(`組織の特定に失敗しました: ${error.message}`);
  }
  if (data?.id !== undefined) {
    return data.id;
  }

  const fromMetadata = subscription.metadata.organization_id;
  if (typeof fromMetadata === 'string' && fromMetadata !== '') {
    return fromMetadata;
  }

  return null;
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
