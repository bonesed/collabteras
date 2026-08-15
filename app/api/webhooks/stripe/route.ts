import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { serverEnv } from '@/lib/env';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';
import { syncSubscription } from '@/lib/stripe/subscription';

// 署名検証には改変前の生ボディが必要なので、Node ランタイムで受ける。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe からのサブスクリプション状態の通知を受け取り、organizations に反映する。
 * ログインユーザーが存在しない文脈なので、更新は service role で行う。
 */
export async function POST(request: Request) {
  const webhookSecret = serverEnv().STRIPE_WEBHOOK_SECRET;

  if (!isStripeConfigured() || webhookSecret === undefined) {
    return new NextResponse('Stripe is not configured', { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (signature === null) {
    return new NextResponse('Missing signature', { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
    );
  } catch (cause) {
    console.error('Stripe Webhook の署名検証に失敗しました', cause);
    return new NextResponse('Invalid signature', { status: 400 });
  }

  try {
    await handleEvent(stripe, event);
  } catch (cause) {
    // 5xx を返すと Stripe が再送してくれる。同期処理は冪等に書いてある。
    console.error(`Stripe Webhook (${event.type}) の処理に失敗しました`, cause);
    return new NextResponse('Webhook handler failed', { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function syncAndRevalidate(
  subscription: Stripe.Subscription,
  fallbackOrganizationId?: string | null,
  options?: { allowDowngrade?: boolean; planTierHint?: string | null },
): Promise<void> {
  await syncSubscription(subscription, fallbackOrganizationId, options);
  // ダッシュボード全体がプラン表示を持つため、layout から再検証する。
  revalidatePath('/', 'layout');
  revalidatePath('/dashboard');
  revalidatePath('/stores/new');
  revalidatePath('/settings/billing');
}

async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const subscriptionId = session.subscription;
      if (typeof subscriptionId !== 'string') {
        return;
      }

      // Checkout のセッションには課金項目の期間が入らないため、引き直す。
      // client_reference_id は組織 ID。metadata 欠落時の保険。
      await syncAndRevalidate(
        await stripe.subscriptions.retrieve(subscriptionId),
        session.client_reference_id,
        {
          // Checkout 完了時点では incomplete のことがある。free に戻さない。
          allowDowngrade: false,
          planTierHint: session.metadata?.plan_tier,
        },
      );
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await syncAndRevalidate(event.data.object);
      return;
    }

    default:
      return;
  }
}
