import { ArrowLeft, Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  BillingPortalButton,
  CheckoutButton,
} from '@/components/features/billing/billing-buttons';
import { PageHeader } from '@/components/features/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getSessionContextSafe } from '@/lib/auth';
import { PLANS } from '@/lib/constants';
import { formatDate, formatJpy } from '@/lib/format';
import { getOrganizationPlanSafe } from '@/lib/queries/organizations';
import { isStripeConfigured } from '@/lib/stripe/client';
import { purchasablePlanTiers } from '@/lib/stripe/plans';
import { reconcileOrganizationSubscription } from '@/lib/stripe/subscription';
import type { MemberRole, Organization, PlanDefinition, PlanTier } from '@/types';

export const metadata: Metadata = { title: 'プランとお支払い' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const BILLING_ROLES: readonly MemberRole[] = ['owner', 'admin'];

const PLAN_ORDER: readonly PlanTier[] = ['free', 'light', 'standard', 'pro'];

/** 迷ったときに勧めるプラン。カードのボタンを強調表示する。 */
const RECOMMENDED_PLAN: PlanTier = 'standard';

const UNRESOLVED_PLAN: PlanDefinition = {
  tier: 'free',
  name: '未設定',
  description: 'プラン情報を取得できませんでした。',
  monthlyPriceJpy: 0,
  limits: {
    maxStores: 0,
    monthlySearches: 0,
    monthlyProposals: 0,
    maxMembers: 0,
    canExportCsv: false,
  },
  features: [],
};

interface BillingPageProps {
  searchParams: Promise<{ checkout?: string }>;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  let checkout: string | undefined;
  try {
    const params = await searchParams;
    checkout = params?.checkout;
  } catch (error) {
    console.error('課金画面の searchParams の取得に失敗しました', error);
  }

  const session = await getSessionContextSafe();

  try {
    const organization = session?.organization;
    const role = session?.role;
    const organizationId = organization?.id;
    let loadFailed = session == null || organizationId == null || organizationId === '';

    if (checkout === 'success' && organizationId != null && organizationId !== '') {
      try {
        await reconcileOrganizationSubscription(organizationId, undefined, {
          allowDowngrade: false,
        });
      } catch (error) {
        console.error('Checkout 完了後のプラン同期に失敗しました', error);
      }
    }

    let latestOrganization: Organization | undefined = organization;
    let currentPlan: PlanDefinition = UNRESOLVED_PLAN;

    if (organizationId != null && organizationId !== '') {
      try {
        const planView = await getOrganizationPlanSafe(organizationId, organization);
        latestOrganization = planView?.organization ?? organization;
        currentPlan = planView?.definition ?? UNRESOLVED_PLAN;
      } catch (error) {
        console.error('課金画面のプラン取得に失敗しました', error);
        loadFailed = true;
      }
    }

    const canManage = role != null && BILLING_ROLES.includes(role);
    let stripeReady = false;
    let purchasable = new Set<string>();
    try {
      stripeReady = isStripeConfigured();
      purchasable = new Set<string>(stripeReady ? purchasablePlanTiers() : []);
    } catch (error) {
      console.error('Stripe 設定の確認に失敗しました', error);
    }

    return (
      <BillingView
        checkout={checkout}
        currentPlan={currentPlan}
        latestOrganization={latestOrganization}
        canManage={canManage}
        stripeReady={stripeReady}
        purchasable={purchasable}
        loadFailed={loadFailed}
      />
    );
  } catch (error) {
    console.error('課金画面の表示に失敗しました', error);
    return (
      <BillingView
        checkout={checkout}
        currentPlan={UNRESOLVED_PLAN}
        latestOrganization={session?.organization}
        canManage={false}
        stripeReady={false}
        purchasable={new Set<string>()}
        loadFailed
      />
    );
  }
}

function BillingView({
  checkout,
  currentPlan,
  latestOrganization,
  canManage,
  stripeReady,
  purchasable,
  loadFailed,
}: {
  checkout?: string;
  currentPlan: PlanDefinition;
  latestOrganization?: Organization;
  canManage: boolean;
  stripeReady: boolean;
  purchasable: Set<string>;
  loadFailed: boolean;
}) {
  const planName = currentPlan?.name ?? '未設定';
  const currentTier = latestOrganization?.plan;

  return (
    <div className="mx-auto max-w-5xl">
      <Button variant="ghost" size="sm" className="mb-4 -ml-3" asChild>
        <Link href="/settings">
          <ArrowLeft className="size-4" aria-hidden />
          設定に戻る
        </Link>
      </Button>

      <PageHeader
        title="プランとお支払い"
        description="ご利用状況に合わせてプランを変更できます。お支払いは Stripe が処理します。"
        action={
          latestOrganization?.stripe_customer_id == null ? undefined : (
            <BillingPortalButton disabled={!canManage} />
          )
        }
      />

      {loadFailed ? (
        <Banner tone="muted">
          データの取得に失敗しましたが、プランは{planName}です。画面は引き続き利用できます。
        </Banner>
      ) : null}

      {checkout === 'success' ? (
        <Banner tone="success">
          お手続きありがとうございます。プランの反映まで数十秒ほどかかることがあります。
        </Banner>
      ) : null}
      {checkout === 'cancelled' ? (
        <Banner tone="muted">
          お手続きを中断しました。プランは変更されていません。
        </Banner>
      ) : null}

      {!stripeReady ? (
        <Banner tone="muted">
          決済が未設定のため、プランの変更はできません。<code>STRIPE_SECRET_KEY</code>{' '}
          と各プランの Price ID を設定すると有効になります。
        </Banner>
      ) : null}
      {stripeReady && !canManage ? (
        <Banner tone="muted">
          プランの変更はオーナーまたは管理者のみ行えます。
        </Banner>
      ) : null}

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            現在のプラン
            <Badge variant="secondary">{planName}</Badge>
          </CardTitle>
          <CardDescription>
            {currentPlan?.description ?? 'プラン情報を表示できません。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <span className="font-medium tabular-nums">
            {formatJpy(currentPlan?.monthlyPriceJpy ?? 0)}
            <span className="ml-1 font-normal text-muted-foreground">/ 月</span>
          </span>
          {latestOrganization?.current_period_end == null ? null : (
            <span className="text-muted-foreground">
              次回更新日 {formatDate(latestOrganization.current_period_end)}
            </span>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS?.[tier];
          if (plan == null) {
            return null;
          }
          return (
            <PlanCard
              key={tier}
              plan={plan}
              isCurrent={tier === currentTier}
              canPurchase={canManage && purchasable.has(tier)}
              hasSubscription={latestOrganization?.stripe_customer_id != null}
            />
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        プランの解約・お支払い方法の変更・領収書の確認は「お支払い情報を管理」から行えます。
        解約しても、期間の終わりまでは現在のプランのままご利用いただけます。
      </p>
    </div>
  );
}

interface PlanCardProps {
  plan: PlanDefinition;
  isCurrent: boolean;
  canPurchase: boolean;
  hasSubscription: boolean;
}

function PlanCard({
  plan,
  isCurrent,
  canPurchase,
  hasSubscription,
}: PlanCardProps) {
  return (
    <Card className={isCurrent ? 'border-primary' : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          {plan?.name ?? 'プラン'}
          {isCurrent ? <Badge variant="secondary">利用中</Badge> : null}
        </CardTitle>
        <CardDescription>{plan?.description ?? ''}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-2xl font-semibold tabular-nums">
          {formatJpy(plan?.monthlyPriceJpy ?? 0)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            / 月
          </span>
        </p>

        <ul className="space-y-1.5 text-sm">
          {(plan?.features ?? []).map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              {feature}
            </li>
          ))}
        </ul>

        <PlanAction
          plan={plan}
          isCurrent={isCurrent}
          canPurchase={canPurchase}
          hasSubscription={hasSubscription}
        />
      </CardContent>
    </Card>
  );
}

function PlanAction({
  plan,
  isCurrent,
  canPurchase,
  hasSubscription,
}: PlanCardProps) {
  if (isCurrent) {
    return (
      <Button variant="outline" className="w-full" disabled>
        利用中のプラン
      </Button>
    );
  }

  // Free への引き下げは解約なので、カスタマーポータルに任せる。
  if (plan?.tier === 'free') {
    return (
      <p className="text-xs text-muted-foreground">
        {hasSubscription
          ? 'ダウングレードは「お支払い情報を管理」から解約してください。'
          : '登録するとすぐに使えます。'}
      </p>
    );
  }

  if (!canPurchase) {
    return (
      <Button variant="outline" className="w-full" disabled>
        現在お申し込みいただけません
      </Button>
    );
  }

  return (
    <CheckoutButton
      planTier={plan.tier}
      label={`${plan?.name ?? 'プラン'} にする`}
      variant={plan?.tier === RECOMMENDED_PLAN ? 'default' : 'outline'}
    />
  );
}

function Banner({
  tone,
  children,
}: {
  tone: 'success' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        tone === 'success'
          ? 'mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
          : 'mb-4 rounded-lg border bg-accent px-4 py-3 text-sm text-accent-foreground'
      }
    >
      {children}
    </p>
  );
}
