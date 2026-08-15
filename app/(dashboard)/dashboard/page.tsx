import {
  Handshake,
  MapPinned,
  Send,
  Sparkles,
  Store as StoreIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { StatCard } from '@/components/features/dashboard/stat-card';
import { EmptyState } from '@/components/features/layout/empty-state';
import { PageHeader } from '@/components/features/layout/page-header';
import { ProposalStatusBadge } from '@/components/features/proposals/proposal-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSessionContext } from '@/lib/auth';
import { getDashboardSummary } from '@/lib/queries/dashboard';
import { getOrganizationPlan } from '@/lib/queries/organizations';
import { countProposalsThisMonth, listProposals } from '@/lib/queries/proposals';
import { countSearchJobsThisMonth } from '@/lib/queries/search-jobs';

export const metadata: Metadata = { title: 'ダッシュボード' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function DashboardPage() {
  const { organization, profile } = await requireSessionContext();
  const [
    { definition: currentPlan, limits },
    summary,
    recentProposals,
    searchCount,
    proposalCount,
  ] = await Promise.all([
    getOrganizationPlan(organization.id),
    getDashboardSummary(organization.id),
    listProposals(organization.id, { limit: 5 }),
    countSearchJobsThisMonth(organization.id),
    countProposalsThisMonth(organization.id),
  ]);
  const displayName = profile.full_name ?? profile.email;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`こんにちは、${displayName} さん`}
        description="コラボ提案の進捗をまとめて確認できます。"
        action={
          <Button asChild>
            <Link href="/candidates">
              <MapPinned className="size-4" aria-hidden />
              コラボ候補を探す
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="登録店舗"
          value={summary.storeCount}
          unit="件"
          hint={`${currentPlan.name} プランの上限 ${limits.maxStores} 件`}
          icon={StoreIcon}
        />
        <StatCard
          label="コラボ候補"
          value={summary.candidateCount}
          unit="件"
          hint={`今月の抽出 ${searchCount} / ${limits.monthlySearches} 件`}
          icon={MapPinned}
        />
        <StatCard
          label="準備中の提案"
          value={summary.draftProposalCount}
          unit="通"
          hint={`今月の生成 ${proposalCount} / ${limits.monthlyProposals} 通`}
          icon={Sparkles}
        />
        <StatCard
          label="送付済みの提案"
          value={summary.sentProposalCount}
          unit="通"
          hint={`成立 ${summary.agreedProposalCount} 件`}
          icon={Send}
        />
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">最近の提案</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/proposals">すべて見る</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentProposals.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="まだ提案がありません"
              description="自店舗を登録すると、近隣のコラボ候補を抽出して提案文を生成できます。"
              action={
                <Button asChild>
                  <Link href="/stores">自店舗を登録する</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {recentProposals.map((proposal) => (
                <li key={proposal.id}>
                  <Link
                    href={`/proposals/${proposal.id}`}
                    className="flex items-center justify-between gap-4 py-3 transition-colors hover:text-primary"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {proposal.subject}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {proposal.candidate.name}
                      </p>
                    </div>
                    <ProposalStatusBadge status={proposal.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
