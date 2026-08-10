import { MapPinned, Store as StoreIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CandidateKanbanBoard } from '@/components/features/candidates/candidate-kanban-board';
import { EmptyState } from '@/components/features/layout/empty-state';
import { PageHeader } from '@/components/features/layout/page-header';
import { Button } from '@/components/ui/button';
import { requireSessionContext } from '@/lib/auth';
import { listCandidatesForPipeline } from '@/lib/queries/candidates';
import { listStores } from '@/lib/queries/stores';

export const metadata: Metadata = { title: 'コラボ候補' };

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
  const stores = await listStores(organization.id);

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
    return null;
  }

  const candidates = await listCandidatesForPipeline(
    organization.id,
    selectedStore.id,
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="コラボ候補"
        description={`${selectedStore.name} の周辺から抽出した店舗の、アプローチ状況です。カードはドラッグで列を移動できます。`}
        action={
          <Button asChild>
            <Link href={`/candidates/search?store=${selectedStore.id}`}>
              <MapPinned className="size-4" aria-hidden />
              近隣を再抽出
            </Link>
          </Button>
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
