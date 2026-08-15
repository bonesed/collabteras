import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { runNearbySearch } from '@/app/(dashboard)/candidates/actions';
import { NearbySearchForm } from '@/components/features/candidates/nearby-search-form';
import { PageHeader } from '@/components/features/layout/page-header';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { requireSessionContext } from '@/lib/auth';
import { JOB_STATUS_LABEL_MAP } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import { getPlanLimits } from '@/lib/plans';
import { getOrganizationPlanSafe } from '@/lib/queries/organizations';
import {
  countSearchJobsThisMonth,
  listRecentSearchJobs,
} from '@/lib/queries/search-jobs';
import { getStore } from '@/lib/queries/stores';
import type { Organization, PlanLimits, SearchJob, Store } from '@/types';

export const metadata: Metadata = { title: '近隣を抽出' };

// Places の取得と AI の採点を同期的に行うため、既定のタイムアウトでは足りない。
export const maxDuration = 120;

interface SearchPageProps {
  searchParams: Promise<{ store?: string }>;
}

export default async function CandidateSearchPage({
  searchParams,
}: SearchPageProps) {
  const { store: storeId } = await searchParams;
  const { organization } = await requireSessionContext();

  if (storeId === undefined) {
    redirect('/candidates');
  }

  const { organization: latestOrganization, limits } =
    await loadPlanLimitsSafely(organization);

  const store = await loadStoreSafely(latestOrganization.id, storeId);
  if (store === null) {
    redirect('/candidates');
  }

  const [jobs, usedThisMonth] = await Promise.all([
    loadRecentJobsSafely(latestOrganization.id, store.id),
    loadSearchCountSafely(latestOrganization.id),
  ]);

  const monthlyLimit = limits.monthlySearches;
  const atLimit = usedThisMonth >= monthlyLimit;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="近隣を抽出"
        description={`${store.name}（${store.address ?? '住所未登録'}）を起点に、周辺の店舗を集めます。`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            抽出条件
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              今月 {usedThisMonth} / {monthlyLimit} 件
            </span>
          </CardTitle>
          <CardDescription>
            範囲を広げるほど候補は増えますが、相性の低い店舗も混ざりやすくなります。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {atLimit ? (
            <p className="rounded-lg border bg-accent px-4 py-3 text-sm text-accent-foreground">
              今月の近隣抽出の上限（{monthlyLimit} 件）に達しています。
              <Link href="/settings/billing" className="ml-1 font-medium underline">
                プランを変更する
              </Link>
            </p>
          ) : (
            <NearbySearchForm
              storeId={store.id}
              defaultRadiusMeters={800}
              action={runNearbySearch}
            />
          )}
        </CardContent>
      </Card>

      {jobs.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">抽出履歴</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="tabular-nums">{formatDateTime(job.created_at)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      半径 {job.radius_meters} m ・ {job.found_count} 件
                      {job.error_message === null ? '' : ` ・ ${job.error_message}`}
                    </p>
                  </div>
                  <Badge
                    variant={job.status === 'failed' ? 'destructive' : 'secondary'}
                  >
                    {JOB_STATUS_LABEL_MAP[job.status] ?? job.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

async function loadPlanLimitsSafely(organization: Organization): Promise<{
  organization: Organization;
  limits: PlanLimits;
}> {
  try {
    const plan = await getOrganizationPlanSafe(organization.id, organization);
    return {
      organization: plan.organization ?? organization,
      limits: plan.limits ?? getPlanLimits(organization.plan),
    };
  } catch (error) {
    console.error('プラン上限の取得に失敗しました', error);
    return {
      organization,
      limits: getPlanLimits(organization.plan),
    };
  }
}

async function loadStoreSafely(
  organizationId: string,
  storeId: string,
): Promise<Store | null> {
  try {
    return await getStore(organizationId, storeId);
  } catch (error) {
    console.error('店舗の取得に失敗しました', error);
    return null;
  }
}

async function loadRecentJobsSafely(
  organizationId: string,
  storeId: string,
): Promise<SearchJob[]> {
  try {
    return (await listRecentSearchJobs(organizationId, storeId)) ?? [];
  } catch (error) {
    console.error('抽出履歴の取得に失敗しました', error);
    return [];
  }
}

async function loadSearchCountSafely(organizationId: string): Promise<number> {
  try {
    return await countSearchJobsThisMonth(organizationId);
  } catch (error) {
    console.error('抽出回数の集計に失敗しました', error);
    return 0;
  }
}
