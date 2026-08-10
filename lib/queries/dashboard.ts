import 'server-only';

import { createClient } from '@/lib/supabase/server';

export interface DashboardSummary {
  storeCount: number;
  candidateCount: number;
  savedCandidateCount: number;
  draftProposalCount: number;
  sentProposalCount: number;
  agreedProposalCount: number;
}

/**
 * 概要カード用の件数をまとめて取得する。
 * 行データは不要なので、件数のみを取得する head リクエストを使う。
 */
export async function getDashboardSummary(
  organizationId: string,
): Promise<DashboardSummary> {
  const supabase = await createClient();

  const [stores, candidates, savedCandidates, proposals] = await Promise.all([
    supabase
      .from('stores')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    supabase
      .from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('is_dismissed', false),
    supabase
      .from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('is_saved', true),
    supabase
      .from('proposals')
      .select('status')
      .eq('organization_id', organizationId),
  ]);

  const failure =
    stores.error ?? candidates.error ?? savedCandidates.error ?? proposals.error;

  if (failure !== null) {
    throw new Error(`集計に失敗しました: ${failure.message}`);
  }

  const statuses = proposals.data ?? [];

  return {
    storeCount: stores.count ?? 0,
    candidateCount: candidates.count ?? 0,
    savedCandidateCount: savedCandidates.count ?? 0,
    draftProposalCount: statuses.filter(
      (row) => row.status === 'draft' || row.status === 'ready',
    ).length,
    sentProposalCount: statuses.filter(
      (row) => row.status === 'sent' || row.status === 'replied',
    ).length,
    agreedProposalCount: statuses.filter((row) => row.status === 'agreed').length,
  };
}
