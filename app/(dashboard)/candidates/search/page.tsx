import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

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
import { JOB_STATUS_LABEL_MAP, PLANS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import {
  countSearchJobsThisMonth,
  listRecentSearchJobs,
} from '@/lib/queries/search-jobs';
import { getStore } from '@/lib/queries/stores';

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

  const store = await getStore(organization.id, storeId);
  if (store === null) {
    notFound();
  }

  const [jobs, usedThisMonth] = await Promise.all([
    listRecentSearchJobs(organization.id, store.id),
    countSearchJobsThisMonth(organization.id),
  ]);

  const monthlyLimit = PLANS[organization.plan].limits.monthlySearches;

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
              今月 {usedThisMonth} / {monthlyLimit} 回
            </span>
          </CardTitle>
          <CardDescription>
            範囲を広げるほど候補は増えますが、相性の低い店舗も混ざりやすくなります。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NearbySearchForm
            storeId={store.id}
            defaultRadiusMeters={800}
            action={runNearbySearch}
          />
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
                    {JOB_STATUS_LABEL_MAP[job.status]}
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
