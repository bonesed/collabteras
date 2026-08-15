'use server';

import { headers } from 'next/headers';

import { requireSessionContext } from '@/lib/auth';
import { resolveAppBaseUrl } from '@/lib/env';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { isPaidPlanTier, priceIdForPlan } from '@/lib/stripe/plans';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult, MemberRole, Organization } from '@/types';

/** 支払いに関わる操作は、請求責任を持つ owner / admin に限る。 */
const BILLING_ROLES: readonly MemberRole[] = ['owner', 'admin'];

interface RedirectTarget {
  url: string;
}

/**
 * Stripe Checkout のセッションを作り、その URL を返す。
 * 実際の遷移はクライアント側で行う（Server Action からの外部リダイレクトは、
 * 戻ってきたときに履歴が壊れやすいため）。
 */
export async function startCheckout(
  planTier: string,
): Promise<ActionResult<RedirectTarget>> {
  const { organization, profile, role } = await requireSessionContext();

  if (!BILLING_ROLES.includes(role)) {
    return { ok: false, error: 'プランの変更は管理者のみ行えます。' };
  }
  if (!isStripeConfigured()) {
    return { ok: false, error: '決済が設定されていません。' };
  }
  if (!isPaidPlanTier(planTier)) {
    return { ok: false, error: '選択できないプランです。' };
  }

  const priceId = priceIdForPlan(planTier);
  if (priceId === null) {
    return { ok: false, error: 'このプランはまだ購入できません。' };
  }

  const returnUrl = await billingReturnUrl();

  try {
    const customerId = await ensureCustomer(organization, profile.email);

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: organization.id,
      // Webhook 側で組織を特定するための紐づけ。顧客 ID からの逆引きも用意してある。
      subscription_data: { metadata: { organization_id: organization.id } },
      success_url: `${returnUrl}?checkout=success`,
      cancel_url: `${returnUrl}?checkout=cancelled`,
    });

    if (session.url === null) {
      return { ok: false, error: '決済ページを開けませんでした。' };
    }

    return { ok: true, data: { url: session.url } };
  } catch (cause) {
    console.error('Stripe Checkout の作成に失敗しました', cause);
    return {
      ok: false,
      error: '決済ページを開けませんでした。時間をおいて再度お試しください。',
    };
  }
}

/** 支払い方法の変更・解約・領収書の確認は Stripe のカスタマーポータルに任せる。 */
export async function openBillingPortal(): Promise<
  ActionResult<RedirectTarget>
> {
  const { organization, role } = await requireSessionContext();

  if (!BILLING_ROLES.includes(role)) {
    return { ok: false, error: 'お支払い情報の管理は管理者のみ行えます。' };
  }
  if (!isStripeConfigured()) {
    return { ok: false, error: '決済が設定されていません。' };
  }
  if (organization.stripe_customer_id === null) {
    return { ok: false, error: 'まだお支払い情報が登録されていません。' };
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: organization.stripe_customer_id,
      return_url: await billingReturnUrl(),
    });

    return { ok: true, data: { url: session.url } };
  } catch (cause) {
    console.error('Stripe カスタマーポータルの作成に失敗しました', cause);
    return {
      ok: false,
      error: 'お支払い情報の画面を開けませんでした。時間をおいて再度お試しください。',
    };
  }
}

/** Checkout / ポータルから戻る先。公開 URL またはリクエスト origin を使う。 */
async function billingReturnUrl(): Promise<string> {
  return `${resolveAppBaseUrl(await readRequestOrigin())}/settings/billing`;
}

async function readRequestOrigin(): Promise<string | null> {
  const headerStore = await headers();
  const origin = headerStore.get('origin');
  if (origin !== null && origin !== '') {
    return origin;
  }

  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  if (host === null || host === '') {
    return null;
  }

  const proto =
    headerStore.get('x-forwarded-proto') ??
    (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');

  return `${proto}://${host}`;
}

/**
 * 組織に対応する Stripe の顧客を用意する。
 * 顧客 ID は組織に保存し、次回以降の決済で同じ顧客に紐づける。
 */
async function ensureCustomer(
  organization: Organization,
  email: string,
): Promise<string> {
  if (organization.stripe_customer_id !== null) {
    return organization.stripe_customer_id;
  }

  const customer = await getStripe().customers.create({
    name: organization.name,
    email,
    metadata: { organization_id: organization.id },
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', organization.id);

  if (error !== null) {
    throw new Error(`お支払い情報の保存に失敗しました: ${error.message}`);
  }

  return customer.id;
}
