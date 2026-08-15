import type { Metadata } from 'next';
import Link from 'next/link';

import { createStore } from '@/app/(dashboard)/stores/actions';
import { PageHeader } from '@/components/features/layout/page-header';
import { StoreForm } from '@/components/features/stores/store-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requireSessionContext } from '@/lib/auth';
import { getOrganizationPlanSafe } from '@/lib/queries/organizations';
import { listStores } from '@/lib/queries/stores';

export const metadata: Metadata = { title: '店舗を追加' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function NewStorePage() {
  const { organization } = await requireSessionContext();
  const { organization: latestOrganization, definition: currentPlan, limits } =
    await getOrganizationPlanSafe(organization.id, organization);
  const stores = await listStores(latestOrganization.id);
  const limit = limits.maxStores;
  const atLimit = stores.length >= limit;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="店舗を追加"
        description="コラボ提案の発信元になるお店の情報を登録します。"
      />

      {atLimit ? (
        <p className="mb-4 rounded-lg border bg-accent px-4 py-3 text-sm text-accent-foreground">
          {currentPlan.name} プランで登録できる店舗数の上限（{limit} 件）に達しています。
          <Link href="/settings/billing" className="ml-1 font-medium underline">
            プランを変更する
          </Link>
        </p>
      ) : null}

      {atLimit ? (
        <Button variant="outline" asChild>
          <Link href="/stores">自店舗に戻る</Link>
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <StoreForm action={createStore} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
