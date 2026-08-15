import { ArrowLeft, MapPinned } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { updateStore } from '@/app/(dashboard)/stores/actions';
import { PageHeader } from '@/components/features/layout/page-header';
import { StoreDeleteButton } from '@/components/features/stores/store-delete-button';
import { StoreForm } from '@/components/features/stores/store-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireSessionContext } from '@/lib/auth';
import { countStoreRelations, getStore } from '@/lib/queries/stores';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface StoreDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: StoreDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const { organization } = await requireSessionContext();
  const store = await getStore(organization.id, id);

  return { title: store?.name ?? '店舗の編集' };
}

export default async function StoreDetailPage({ params }: StoreDetailPageProps) {
  const { id } = await params;
  const { organization } = await requireSessionContext();
  const store = await getStore(organization.id, id);

  if (store === null) {
    notFound();
  }

  const relations = await countStoreRelations(organization.id, store.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" className="mb-4 -ml-3" asChild>
        <Link href="/stores">
          <ArrowLeft className="size-4" aria-hidden />
          自店舗に戻る
        </Link>
      </Button>

      <PageHeader
        title={store.name}
        description="登録内容は、近隣の抽出範囲と AI が書く提案文の両方に反映されます。"
        action={
          <Button variant="outline" asChild>
            <Link href={`/candidates?store=${store.id}`}>
              <MapPinned className="size-4" aria-hidden />
              コラボ候補を見る（{relations.candidates}）
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <StoreForm action={updateStore} store={store} />
        </CardContent>
      </Card>

      <section className="mt-8 rounded-xl border border-destructive/30 p-5">
        <h2 className="text-sm font-semibold">店舗の削除</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          この店舗のコラボ候補 {relations.candidates} 件と提案 {relations.proposals} 件も
          一緒に削除されます。
        </p>
        <StoreDeleteButton
          storeId={store.id}
          storeName={store.name}
          relations={relations}
        />
      </section>
    </div>
  );
}
