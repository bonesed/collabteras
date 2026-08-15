import { MapPinned, Store as StoreIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CandidateKanbanBoard } from '@/components/features/candidates/candidate-kanban-board';
import { CsvExportButton } from '@/components/features/candidates/csv-export-button';
import { EmptyState } from '@/components/features/layout/empty-state';
import { PageHeader } from '@/components/features/layout/page-header';
import { Button } from '@/components/ui/button';
import { requireSessionContext } from '@/lib/auth';
import { listCandidatesForPipeline } from '@/lib/queries/candidates';
import { getOrganizationPlanSafe } from '@/lib/queries/organizations';
import { listStores } from '@/lib/queries/stores';
import type { CandidateWithProposals, Store } from '@/types';

export const metadata: Metadata = { title: 'コラボ候補' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// AI による提案文の生成をこのページの Server Action から呼ぶため、余裕を持たせる。
export const maxDuration = 60;

interface CandidatesPageProps {
  searchParams: Promise<{ store?: string; candidate?: string }>;
}

export default async function CandidatesPage({
  searchParams,
}: CandidatesPageProps) {
  const { store: requestedStoreId, candidate: openCandidateId } =
    await searchParams;
  const { organization } = await requireSessionContext();
  const { organization: latestOrganization, limits } =
    await getOrganizationPlanSafe(organization.id, organization);

  const stores = await loadStoresSafely(latestOrganization.id);

  if (stores.length === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="コラボ候補" />
        <EmptyState
          icon={StoreIcon}
          title="まずは自店舗を登録してください"
          description="登録された店舗の位置と業種をもとに、近隣のコラボ候補を抽出します。"
          action={
            <Button asChild>
              <Link href="/stores/new">自店舗を登録する</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const selectedStore =
    stores.find((store) => store.id === requestedStoreId) ?? stores[0];

  if (selectedStore === undefined) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="コラボ候補" />
        <EmptyState
          icon={StoreIcon}
          title="店舗を表示できません"
          description="指定された店舗が見つからないか、店舗データの取得に失敗しました。"
          action={
            <Button asChild>
              <Link href="/stores">自店舗一覧を見る</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const candidates = await loadCandidatesSafely(
    latestOrganization.id,
    selectedStore.id,
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="コラボ候補"
        description={`${selectedStore.name} の周辺から抽出した店舗の、アプローチ状況です。カードはドラッグで列を移動できます。`}
        action={
          <div className="flex flex-wrap gap-2">
            {candidates.length > 0 ? (
              <CsvExportButton
                storeId={selectedStore.id}
                storeName={selectedStore.name}
                canExport={limits.canExportCsv}
              />
            ) : null}
            <Button asChild>
              <Link href={`/candidates/search?store=${selectedStore.id}`}>
                <MapPinned className="size-4" aria-hidden />
                近隣を再抽出
              </Link>
            </Button>
          </div>
        }
      />

      {stores.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {stores.map((store) => (
            <Button
              key={store.id}
              variant={store.id === selectedStore.id ? 'default' : 'outline'}
              size="sm"
              asChild
            >
              <Link href={`/candidates?store=${store.id}`}>{store.name}</Link>
            </Button>
          ))}
        </div>
      ) : null}

      {candidates.length === 0 ? (
        <EmptyState
          icon={MapPinned}
          title="候補がまだありません"
          description="「近隣を再抽出」から、Google Maps 上の近隣店舗を取得して相性を判定します。"
          action={
            <Button asChild>
              <Link href={`/candidates/search?store=${selectedStore.id}`}>
                近隣を抽出する
              </Link>
            </Button>
          }
        />
      ) : (
        <CandidateKanbanBoard
          storeName={selectedStore.name}
          candidates={candidates}
          initialCandidateId={openCandidateId}
        />
      )}
    </div>
  );
}

async function loadStoresSafely(organizationId: string): Promise<Store[]> {
  try {
    return (await listStores(organizationId)) ?? [];
  } catch (error) {
    console.error('店舗の取得に失敗しました', error);
    return [];
  }
}

async function loadCandidatesSafely(
  organizationId: string,
  storeId: string,
): Promise<CandidateWithProposals[]> {
  try {
    return (await listCandidatesForPipeline(organizationId, storeId)) ?? [];
  } catch (error) {
    console.error('コラボ候補の取得に失敗しました', error);
    return [];
  }
}
