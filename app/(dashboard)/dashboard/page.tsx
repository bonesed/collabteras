import {
  Handshake,
  MapPinned,
  Send,
  Sparkles,
  Store as StoreIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

import { StatCard } from '@/components/features/dashboard/stat-card';
import { EmptyState } from '@/components/features/layout/empty-state';
import { PageHeader } from '@/components/features/layout/page-header';
import { ProposalStatusBadge } from '@/components/features/proposals/proposal-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSessionContext } from '@/lib/auth';
import {
  getDashboardSummary,
  type DashboardSummary,
} from '@/lib/queries/dashboard';
import { getOrganizationPlanSafe } from '@/lib/queries/organizations';
import { countProposalsThisMonth, listProposals } from '@/lib/queries/proposals';
import { countSearchJobsThisMonth } from '@/lib/queries/search-jobs';
import type { ProposalWithCandidate } from '@/types';

export const metadata: Metadata = { title: 'ダッシュボード' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const EMPTY_SUMMARY: DashboardSummary = {
  storeCount: 0,
  candidateCount: 0,
  savedCandidateCount: 0,
  draftProposalCount: 0,
  sentProposalCount: 0,
  agreedProposalCount: 0,
};

export default async function DashboardPage() {
  try {
    const { organization, profile } = await requireSessionContext();
    const displayName = profile.full_name ?? profile.email;

    const { organization: latestOrganization, definition: currentPlan, limits } =
      await getOrganizationPlanSafe(organization.id, organization);

    const [summary, recentProposals, searchCount, proposalCount] =
      await Promise.all([
        loadSummarySafely(latestOrganization.id),
        loadRecentProposalsSafely(latestOrganization.id),
        loadSearchCountSafely(latestOrganization.id),
        loadProposalCountSafely(latestOrganization.id),
      ]);

    const planName =
      currentPlan?.name != null && currentPlan.name !== ''
        ? currentPlan.name
        : null;
    const maxStores = limits?.maxStores;
    const monthlySearches = limits?.monthlySearches;
    const monthlyProposals = limits?.monthlyProposals;

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
            hint={
              planName != null && maxStores != null
                ? `${planName} プランの上限 ${maxStores} 件`
                : 'プラン上限を取得できませんでした'
            }
            icon={StoreIcon}
          />
          <StatCard
            label="コラボ候補"
            value={summary.candidateCount}
            unit="件"
            hint={
              monthlySearches != null
                ? `今月の抽出 ${searchCount} / ${monthlySearches} 件`
                : `今月の抽出 ${searchCount} 件`
            }
            icon={MapPinned}
          />
          <StatCard
            label="準備中の提案"
            value={summary.draftProposalCount}
            unit="通"
            hint={
              monthlyProposals != null
                ? `今月の生成 ${proposalCount} / ${monthlyProposals} 通`
                : `今月の生成 ${proposalCount} 通`
            }
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
  } catch (error) {
    unstable_rethrow(error);
    console.error('ダッシュボードの読み込みに失敗しました', error);

    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="ダッシュボード"
          description="コラボ提案の進捗をまとめて確認できます。"
        />
        <EmptyState
          icon={Handshake}
          title="ダッシュボードを表示できません"
          description="データの取得に失敗しました。時間をおいて再度お試しください。"
          action={
            <Button asChild>
              <Link href="/settings/billing">プランとお支払いを確認</Link>
            </Button>
          }
        />
      </div>
    );
  }
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

async function loadSummarySafely(
  organizationId: string,
): Promise<DashboardSummary> {
  try {
    return await getDashboardSummary(organizationId);
  } catch (error) {
    console.error('ダッシュボード集計の取得に失敗しました', error);
    return EMPTY_SUMMARY;
  }
}

async function loadRecentProposalsSafely(
  organizationId: string,
): Promise<ProposalWithCandidate[]> {
  try {
    return (await listProposals(organizationId, { limit: 5 })) ?? [];
  } catch (error) {
    console.error('最近の提案の取得に失敗しました', error);
    return [];
  }
}

async function loadSearchCountSafely(organizationId: string): Promise<number> {
  try {
    return await countSearchJobsThisMonth(organizationId);
  } catch (error) {
    console.error('抽出回数の取得に失敗しました', error);
    return 0;
  }
}

async function loadProposalCountSafely(organizationId: string): Promise<number> {
  try {
    return await countProposalsThisMonth(organizationId);
  } catch (error) {
    console.error('提案数の取得に失敗しました', error);
    return 0;
  }
}
