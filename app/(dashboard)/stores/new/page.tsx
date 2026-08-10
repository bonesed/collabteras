import type { Metadata } from 'next';

import { createStore } from '@/app/(dashboard)/stores/actions';
import { PageHeader } from '@/components/features/layout/page-header';
import { StoreForm } from '@/components/features/stores/store-form';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: '店舗を追加' };

export default function NewStorePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="店舗を追加"
        description="コラボ提案の発信元になるお店の情報を登録します。"
      />
      <Card>
        <CardContent className="pt-6">
          <StoreForm action={createStore} />
        </CardContent>
      </Card>
    </div>
  );
}
