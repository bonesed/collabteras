import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { SearchJob } from '@/types';

export async function listRecentSearchJobs(
  organizationId: string,
  storeId: string,
  limit = 5,
): Promise<SearchJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('search_jobs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw new Error(`抽出履歴の取得に失敗しました: ${error.message}`);
  }

  return data;
}

/** 当月に実行した抽出ジョブの件数。プランの上限判定に使う。 */
export async function countSearchJobsThisMonth(
  organizationId: string,
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const supabase = await createClient();
  const { count, error } = await supabase
    .from('search_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', monthStart);

  if (error !== null) {
    throw new Error(`抽出回数の集計に失敗しました: ${error.message}`);
  }

  return count ?? 0;
}
