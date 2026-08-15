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
 * 書き込み先は `public.organizations`（subscriptions テーブルは存在しない）。
 */
export async function POST(request: Request) {
  const webhookSecret = serverEnv().STRIPE_WEBHOOK_SECRET;

  console.log('STRIPE_WEBHOOK_ENV:', {
    hasWebhookSecret: webhookSecret !== undefined,
    hasStripeSecret: process.env.STRIPE_SECRET_KEY !== undefined,
    hasServiceRole: process.env.SUPABASE_SERVICE_ROLE_KEY !== undefined,
    hasPricePro: process.env.STRIPE_PRICE_ID_PRO !== undefined,
    hasPriceStandard: process.env.STRIPE_PRICE_ID_STANDARD !== undefined,
    hasPriceLight: process.env.STRIPE_PRICE_ID_LIGHT !== undefined,
  });

  if (!isStripeConfigured() || webhookSecret === undefined) {
    console.error('STRIPE_WEBHOOK: Stripe または Webhook Secret が未設定です');
    return new NextResponse('Stripe is not configured', { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (signature === null) {
    console.error('STRIPE_WEBHOOK: stripe-signature ヘッダーがありません');
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

  console.log('STRIPE_WEBHOOK_EVENT:', {
    type: event.type,
    id: event.id,
    created: event.created,
    livemode: event.livemode,
  });

  try {
    await handleEvent(stripe, event);
  } catch (cause) {
    // 5xx を返すと Stripe が再送してくれる。同期処理は冪等に書いてある。
    console.error(`Stripe Webhook (${event.type}) の処理に失敗しました`, cause);
    return new NextResponse('Webhook handler failed', { status: 500 });
  }

  console.log('STRIPE_WEBHOOK_DONE:', { type: event.type, id: event.id });
  return NextResponse.json({ received: true });
}

async function syncAndRevalidate(
  subscription: Stripe.Subscription,
  fallbackOrganizationId?: string | null,
  options?: { allowDowngrade?: boolean; planTierHint?: string | null },
): Promise<void> {
  console.log('STRIPE_SYNC_AND_REVALIDATE:', {
    subscriptionId: subscription.id,
    status: subscription.status,
    customer: customerIdOf(subscription),
    fallbackOrganizationId: fallbackOrganizationId ?? null,
    options,
    metadata: subscription.metadata,
    priceId: subscription.items.data[0]?.price.id ?? null,
  });

  await syncSubscription(subscription, fallbackOrganizationId, options);
  // ダッシュボード全体がプラン表示を持つため、layout から再検証する。
  revalidatePath('/', 'layout');
  revalidatePath('/dashboard');
  revalidatePath('/stores/new');
  revalidatePath('/settings/billing');
}

function isTerminalStatus(status: Stripe.Subscription.Status): boolean {
  return (
    status === 'canceled' ||
    status === 'unpaid' ||
    status === 'incomplete_expired'
  );
}

async function retrieveSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  console.log('STRIPE_RETRIEVE_SUBSCRIPTION:', { subscriptionId });
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });
  console.log('STRIPE_RETRIEVED_SUBSCRIPTION:', {
    id: subscription.id,
    status: subscription.status,
    customer: customerIdOf(subscription),
    metadata: subscription.metadata,
    priceId: subscription.items.data[0]?.price.id ?? null,
    itemCount: subscription.items.data.length,
  });
  return subscription;
}

async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      console.log('STRIPE_CHECKOUT_SESSION:', {
        id: session.id,
        mode: session.mode,
        status: session.status,
        paymentStatus: session.payment_status,
        customer: session.customer,
        subscription: session.subscription,
        clientReferenceId: session.client_reference_id,
        metadata: session.metadata,
      });

      const subscription = await subscriptionFromCheckout(stripe, session);
      if (subscription === null) {
        console.error(
          'STRIPE_CHECKOUT: subscription を特定できません。organizations は更新しません。',
          { sessionId: session.id, mode: session.mode },
        );
        return;
      }

      await syncAndRevalidate(subscription, session.client_reference_id, {
        // Checkout 完了時点では incomplete のことがある。free に戻さない。
        allowDowngrade: false,
        planTierHint:
          session.metadata?.plan_tier ?? subscription.metadata.plan_tier,
      });
      return;
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const subscriptionId = subscriptionIdOfInvoice(invoice);
      console.log('STRIPE_INVOICE:', {
        id: invoice.id,
        status: invoice.status,
        customer: invoice.customer,
        subscriptionId,
        metadata: invoice.metadata,
        billingReason: invoice.billing_reason,
      });

      if (subscriptionId === null) {
        console.error(
          'STRIPE_INVOICE: subscription ID がありません。organizations は更新しません。',
          { invoiceId: invoice.id },
        );
        return;
      }

      await syncAndRevalidate(
        await retrieveSubscription(stripe, subscriptionId),
        metadataValue(invoice, 'organization_id'),
        {
          allowDowngrade: false,
          planTierHint: metadataValue(invoice, 'plan_tier'),
        },
      );
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      console.log('STRIPE_SUBSCRIPTION_EVENT:', {
        type: event.type,
        id: subscription.id,
        status: subscription.status,
        customer: customerIdOf(subscription),
        metadata: subscription.metadata,
        priceId: subscription.items.data[0]?.price.id ?? null,
      });

      await syncAndRevalidate(subscription, null, {
        // 作成・更新では free に戻さない。消すのは削除/終了イベントだけ。
        allowDowngrade: isTerminalStatus(subscription.status),
        planTierHint: subscription.metadata.plan_tier,
      });
      return;
    }

    case 'customer.subscription.deleted': {
      console.log('STRIPE_SUBSCRIPTION_DELETED:', {
        id: event.data.object.id,
        status: event.data.object.status,
        customer: customerIdOf(event.data.object),
      });

      await syncAndRevalidate(event.data.object, null, {
        allowDowngrade: true,
        planTierHint: event.data.object.metadata.plan_tier,
      });
      return;
    }

    default:
      console.log('STRIPE_WEBHOOK_IGNORED:', { type: event.type, id: event.id });
      return;
  }
}

/**
 * Checkout セッションから契約を取る。
 * `session.subscription` が文字列でもオブジェクトでも、欠落時は顧客から引き直す。
 */
async function subscriptionFromCheckout(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<Stripe.Subscription | null> {
  const subscriptionId = asId(session.subscription);
  if (subscriptionId !== null) {
    return retrieveSubscription(stripe, subscriptionId);
  }

  const customerId = asId(session.customer);
  console.warn(
    'STRIPE_CHECKOUT: session.subscription が無いため顧客の契約を検索します',
    { sessionId: session.id, customerId },
  );

  if (customerId === null) {
    return null;
  }

  const listed = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 5,
    expand: ['data.items.data.price'],
  });

  console.log('STRIPE_CHECKOUT_LISTED_SUBSCRIPTIONS:', {
    customerId,
    count: listed.data.length,
    ids: listed.data.map((item) => ({ id: item.id, status: item.status })),
  });

  return listed.data[0] ?? null;
}

function subscriptionIdOfInvoice(invoice: Stripe.Invoice): string | null {
  const record = invoice as unknown as {
    subscription?: string | { id?: string } | null;
    parent?: {
      subscription_details?: { subscription?: string | { id?: string } | null };
    };
    lines?: {
      data?: Array<{
        subscription?: string | { id?: string } | null;
        parent?: {
          subscription_item_details?: {
            subscription?: string | { id?: string } | null;
          };
        };
      }>;
    };
  };

  const fromLine = record.lines?.data?.[0];

  return (
    asId(record.subscription) ??
    asId(record.parent?.subscription_details?.subscription) ??
    asId(fromLine?.subscription) ??
    asId(fromLine?.parent?.subscription_item_details?.subscription)
  );
}

function metadataValue(
  invoice: Stripe.Invoice,
  key: string,
): string | null {
  const value = invoice.metadata?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function asId(value: string | { id?: string } | null | undefined): string | null {
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  if (value !== null && typeof value === 'object' && typeof value.id === 'string') {
    return value.id;
  }
  return null;
}

function customerIdOf(subscription: Stripe.Subscription): string | null {
  if (typeof subscription.customer === 'string') {
    return subscription.customer;
  }
  if (subscription.customer !== null && typeof subscription.customer === 'object') {
    return subscription.customer.id;
  }
  return null;
}
