import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Store } from '@/types';

export async function listStores(organizationId: string): Promise<Store[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error !== null) {
    throw new Error(`店舗の取得に失敗しました: ${error.message}`);
  }

  return data;
}

export async function getStore(
  organizationId: string,
  storeId: string,
): Promise<Store | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', storeId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`店舗の取得に失敗しました: ${error.message}`);
  }

  return data;
}

export interface StoreRelationCounts {
  candidates: number;
  proposals: number;
}

/** 店舗を削除すると cascade で一緒に消えるレコードの件数 */
export async function countStoreRelations(
  organizationId: string,
  storeId: string,
): Promise<StoreRelationCounts> {
  const supabase = await createClient();

  const [candidates, proposals] = await Promise.all([
    supabase
      .from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('store_id', storeId),
    supabase
      .from('proposals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('store_id', storeId),
  ]);

  if (candidates.error !== null) {
    throw new Error(`候補数の集計に失敗しました: ${candidates.error.message}`);
  }
  if (proposals.error !== null) {
    throw new Error(`提案数の集計に失敗しました: ${proposals.error.message}`);
  }

  return {
    candidates: candidates.count ?? 0,
    proposals: proposals.count ?? 0,
  };
}
