import { MapPin, Plus, Store as StoreIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/features/layout/empty-state';
import { PageHeader } from '@/components/features/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSessionContext } from '@/lib/auth';
import { getOrganizationPlan } from '@/lib/queries/organizations';
import { listStores } from '@/lib/queries/stores';

export const metadata: Metadata = { title: '自店舗' };

export const dynamic = 'force-dynamic';

export default async function StoresPage() {
  const { organization } = await requireSessionContext();
  const { organization: latestOrganization, limits, definition } =
    await getOrganizationPlan(organization.id);
  const stores = await listStores(latestOrganization.id);
  const canAddStore = stores.length < limits.maxStores;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="自店舗"
        description="コラボ提案の発信元になるお店です。情報が具体的なほど、AI の提案精度が上がります。"
        action={
          <Button asChild disabled={!canAddStore}>
            <Link href="/stores/new">
              <Plus className="size-4" aria-hidden />
              店舗を追加
            </Link>
          </Button>
        }
      />

      {!canAddStore ? (
        <p className="mb-4 rounded-lg border bg-accent px-4 py-3 text-sm text-accent-foreground">
          {definition.name} プランで登録できる店舗数の上限（{limits.maxStores} 件）に達しています。
          <Link href="/settings/billing" className="ml-1 font-medium underline">
            プランを変更する
          </Link>
        </p>
      ) : null}

      {stores.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="店舗がまだ登録されていません"
          description="店名・業種・所在地・強みを登録すると、徒歩圏のコラボ候補の抽出を開始できます。"
          action={
            <Button asChild>
              <Link href="/stores/new">
                <Plus className="size-4" aria-hidden />
                最初の店舗を登録する
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {stores.map((store) => (
            <Card key={store.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between gap-3 text-base">
                  <Link href={`/stores/${store.id}`} className="hover:text-primary">
                    {store.name}
                  </Link>
                  <Badge variant="secondary">{store.category}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {store.address === null ? null : (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {store.address}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/candidates?store=${store.id}`}>候補を見る</Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/stores/${store.id}`}>編集</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
