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
import {
  EMPTY_DASHBOARD_SUMMARY,
  getDashboardSummary,
  type DashboardSummary,
} from '@/lib/queries/dashboard';
import { getOrganizationPlan } from '@/lib/queries/organizations';
import { countProposalsThisMonth, listProposals } from '@/lib/queries/proposals';
import { countSearchJobsThisMonth } from '@/lib/queries/search-jobs';
import type { ProposalWithCandidate } from '@/types';

export const metadata: Metadata = { title: 'ダッシュボード' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function DashboardPage() {
  // /settings/billing と同じ：Cookie 付き createClient → セッション → organizations.plan
  const { organization, profile } = await requireSessionContext();
  const { organization: latestOrganization, definition: currentPlan, limits } =
    await getOrganizationPlan(organization.id);

  const displayName = profile.full_name ?? profile.email;

  const [summary, recentProposals, searchCount, proposalCount] =
    await Promise.all([
      loadSummary(latestOrganization.id),
      loadRecentProposals(latestOrganization.id),
      loadSearchCount(latestOrganization.id),
      loadProposalCount(latestOrganization.id),
    ]);

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

      <RecentProposalsCard proposals={recentProposals} />
    </div>
  );
}

function RecentProposalsCard({
  proposals,
}: {
  proposals: ProposalWithCandidate[];
}) {
  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">最近の提案</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/proposals">すべて見る</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {proposals.length === 0 ? (
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
            {proposals.map((proposal) => (
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
                      {proposal.candidate?.name ?? '候補名なし'}
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
  );
}

/** 店舗・候補・提案が 0 件 / null でも集計失敗にしない。 */
async function loadSummary(organizationId: string): Promise<DashboardSummary> {
  try {
    const summary = await getDashboardSummary(organizationId);
    return summary ?? EMPTY_DASHBOARD_SUMMARY;
  } catch (error) {
    console.error('ダッシュボード集計の取得に失敗しました', error);
    return EMPTY_DASHBOARD_SUMMARY;
  }
}

async function loadRecentProposals(
  organizationId: string,
): Promise<ProposalWithCandidate[]> {
  try {
    return (await listProposals(organizationId, { limit: 5 })) ?? [];
  } catch (error) {
    console.error('最近の提案の取得に失敗しました', error);
    return [];
  }
}

async function loadSearchCount(organizationId: string): Promise<number> {
  try {
    return (await countSearchJobsThisMonth(organizationId)) ?? 0;
  } catch (error) {
    console.error('抽出回数の取得に失敗しました', error);
    return 0;
  }
}

async function loadProposalCount(organizationId: string): Promise<number> {
  try {
    return (await countProposalsThisMonth(organizationId)) ?? 0;
  } catch (error) {
    console.error('提案数の取得に失敗しました', error);
    return 0;
  }
}
