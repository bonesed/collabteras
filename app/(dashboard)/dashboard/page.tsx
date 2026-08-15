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
import { getSessionContextSafe } from '@/lib/auth';
import {
  EMPTY_DASHBOARD_SUMMARY,
  getDashboardSummary,
  type DashboardSummary,
} from '@/lib/queries/dashboard';
import { getOrganizationPlanSafe } from '@/lib/queries/organizations';
import { countProposalsThisMonth, listProposals } from '@/lib/queries/proposals';
import { countSearchJobsThisMonth } from '@/lib/queries/search-jobs';
import type { PlanLimits, ProposalWithCandidate } from '@/types';

export const metadata: Metadata = { title: 'ダッシュボード' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const EMPTY_LIMITS: PlanLimits = {
  maxStores: 0,
  monthlySearches: 0,
  monthlyProposals: 0,
  maxMembers: 0,
  canExportCsv: false,
};

export default async function DashboardPage() {
  const session = await getSessionContextSafe();

  try {
    const organization = session?.organization;
    const profile = session?.profile;
    const organizationId = organization?.id;
    const displayName = profile?.full_name ?? profile?.email ?? 'ゲスト';

    let planName = '未設定';
    let limits = EMPTY_LIMITS;
    let loadFailed = session == null || organizationId == null || organizationId === '';

    if (organizationId != null && organizationId !== '') {
      try {
        const planView = await getOrganizationPlanSafe(organizationId, organization);
        planName = planView?.definition?.name ?? '未設定';
        limits = planView?.limits ?? EMPTY_LIMITS;
      } catch (error) {
        console.error('ダッシュボードのプラン取得に失敗しました', error);
        loadFailed = true;
      }
    }

    const [summary, recentProposals, searchCount, proposalCount] =
      organizationId != null && organizationId !== ''
        ? await Promise.all([
            loadSummary(organizationId),
            loadRecentProposals(organizationId),
            loadSearchCount(organizationId),
            loadProposalCount(organizationId),
          ])
        : [EMPTY_DASHBOARD_SUMMARY, [] as ProposalWithCandidate[], 0, 0];

    return (
      <DashboardView
        displayName={displayName}
        planName={planName}
        limits={limits}
        summary={summary ?? EMPTY_DASHBOARD_SUMMARY}
        recentProposals={recentProposals ?? []}
        searchCount={searchCount ?? 0}
        proposalCount={proposalCount ?? 0}
        loadFailed={loadFailed}
      />
    );
  } catch (error) {
    console.error('ダッシュボードの表示に失敗しました', error);
    return (
      <DashboardView
        displayName="ゲスト"
        planName="未設定"
        limits={EMPTY_LIMITS}
        summary={EMPTY_DASHBOARD_SUMMARY}
        recentProposals={[]}
        searchCount={0}
        proposalCount={0}
        loadFailed
      />
    );
  }
}

function DashboardView({
  displayName,
  planName,
  limits,
  summary,
  recentProposals,
  searchCount,
  proposalCount,
  loadFailed,
}: {
  displayName: string;
  planName: string;
  limits: PlanLimits;
  summary: DashboardSummary;
  recentProposals: ProposalWithCandidate[];
  searchCount: number;
  proposalCount: number;
  loadFailed: boolean;
}) {
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

      {loadFailed ? (
        <p className="mb-4 rounded-lg border bg-accent px-4 py-3 text-sm text-accent-foreground">
          データの取得に失敗しましたが、プランは{planName}です。画面は引き続き利用できます。
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="登録店舗"
          value={summary?.storeCount ?? 0}
          unit="件"
          hint={`${planName} プランの上限 ${limits?.maxStores ?? 0} 件`}
          icon={StoreIcon}
        />
        <StatCard
          label="コラボ候補"
          value={summary?.candidateCount ?? 0}
          unit="件"
          hint={`今月の抽出 ${searchCount ?? 0} / ${limits?.monthlySearches ?? 0} 件`}
          icon={MapPinned}
        />
        <StatCard
          label="準備中の提案"
          value={summary?.draftProposalCount ?? 0}
          unit="通"
          hint={`今月の生成 ${proposalCount ?? 0} / ${limits?.monthlyProposals ?? 0} 通`}
          icon={Sparkles}
        />
        <StatCard
          label="送付済みの提案"
          value={summary?.sentProposalCount ?? 0}
          unit="通"
          hint={`成立 ${summary?.agreedProposalCount ?? 0} 件`}
          icon={Send}
        />
      </div>

      <RecentProposalsCard proposals={recentProposals ?? []} />
    </div>
  );
}

function RecentProposalsCard({
  proposals,
}: {
  proposals: ProposalWithCandidate[];
}) {
  const items = proposals ?? [];

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">最近の提案</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/proposals">すべて見る</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
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
            {items.map((proposal) => (
              <li key={proposal?.id ?? proposal?.subject}>
                <Link
                  href={`/proposals/${proposal?.id ?? ''}`}
                  className="flex items-center justify-between gap-4 py-3 transition-colors hover:text-primary"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {proposal?.subject ?? '件名なし'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {proposal?.candidate?.name ?? '候補名なし'}
                    </p>
                  </div>
                  {proposal?.status != null ? (
                    <ProposalStatusBadge status={proposal.status} />
                  ) : null}
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
