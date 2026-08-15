import type { Metadata } from 'next';
import Link from 'next/link';

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
import { requireSessionContext } from '@/lib/auth';
import { formatJpy } from '@/lib/format';
import { getOrganizationPlan } from '@/lib/queries/organizations';

export const metadata: Metadata = { title: '設定' };

const ROLE_LABELS = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
} as const;

export default async function SettingsPage() {
  const { organization, profile, role } = await requireSessionContext();
  const { definition: plan } = await getOrganizationPlan(organization.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="設定"
        description="組織情報、プラン、アカウントの確認と変更を行います。"
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">組織</CardTitle>
            <CardDescription>請求とメンバー管理の単位です。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">組織名</span>
              <span className="font-medium">{organization.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">あなたの権限</span>
              <span className="font-medium">{ROLE_LABELS[role]}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              プラン
              <Badge variant="secondary">{plan.name}</Badge>
            </CardTitle>
            <CardDescription>{plan.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">月額</span>
              <span className="font-medium tabular-nums">
                {formatJpy(plan.monthlyPriceJpy)}
              </span>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-muted-foreground">店舗登録</dt>
                <dd className="font-medium tabular-nums">
                  {plan.limits.maxStores} 件
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-muted-foreground">近隣抽出（月）</dt>
                <dd className="font-medium tabular-nums">
                  {plan.limits.monthlySearches} 件
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-muted-foreground">AI 提案文（月）</dt>
                <dd className="font-medium tabular-nums">
                  {plan.limits.monthlyProposals} 通
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-muted-foreground">メンバー</dt>
                <dd className="font-medium tabular-nums">
                  {plan.limits.maxMembers} 人
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-muted-foreground">CSV 一括出力</dt>
                <dd className="font-medium">
                  {plan.limits.canExportCsv ? '利用可' : 'プロプランのみ'}
                </dd>
              </div>
            </dl>
            <Button variant="outline" asChild>
              <Link href="/settings/billing">プランを変更・お支払い管理</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">アカウント</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">お名前</span>
              <span className="font-medium">{profile.full_name ?? '未設定'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">メールアドレス</span>
              <span className="font-medium">{profile.email}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
