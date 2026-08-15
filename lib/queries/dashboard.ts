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

export const EMPTY_DASHBOARD_SUMMARY: DashboardSummary = {
  storeCount: 0,
  candidateCount: 0,
  savedCandidateCount: 0,
  draftProposalCount: 0,
  sentProposalCount: 0,
  agreedProposalCount: 0,
};

/**
 * 概要カード用の件数をまとめて取得する。
 * 行データは不要なので、件数のみを取得する head リクエストを使う。
 */
export async function getDashboardSummary(
  organizationId: string,
): Promise<DashboardSummary> {
  try {
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
      stores.error ??
      candidates.error ??
      savedCandidates.error ??
      proposals.error;

    if (failure !== null) {
      console.error('集計に失敗しました', failure);
      return EMPTY_DASHBOARD_SUMMARY;
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
      agreedProposalCount: statuses.filter((row) => row.status === 'agreed')
        .length,
    };
  } catch (error) {
    console.error('集計に失敗しました', error);
    return EMPTY_DASHBOARD_SUMMARY;
  }
}
