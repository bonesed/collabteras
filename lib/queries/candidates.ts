import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/utils';
import type { Candidate, CandidateWithProposals } from '@/types';

/** カンバンのカードに必要な、候補にぶら下がる提案の項目 */
const CANDIDATE_PROPOSALS_SELECT =
  '*, proposals(id, status, collab_type, subject, body, model, updated_at)';

/**
 * カンバン用に、候補と紐づく提案をまとめて取得する。
 * 見送り（is_dismissed）も列として表示するため、除外せずすべて返す。
 */
export async function listCandidatesForPipeline(
  organizationId: string,
  storeId: string,
  limit = 100,
): Promise<CandidateWithProposals[]> {
  if (!isUuid(organizationId) || !isUuid(storeId)) {
    return [];
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('candidates')
      .select(CANDIDATE_PROPOSALS_SELECT)
      .eq('organization_id', organizationId)
      .eq('store_id', storeId)
      .order('compatibility_score', { ascending: false, nullsFirst: false })
      .order('updated_at', { referencedTable: 'proposals', ascending: false })
      .limit(limit);

    if (error !== null) {
      console.error('コラボ候補の取得に失敗しました', error);
      return [];
    }

    return (data ?? []).map(normalizeCandidateWithProposals);
  } catch (error) {
    console.error('コラボ候補の取得に失敗しました', error);
    return [];
  }
}

function normalizeCandidateWithProposals(
  row: CandidateWithProposals,
): CandidateWithProposals {
  return {
    ...row,
    proposals: Array.isArray(row.proposals) ? row.proposals : [],
    score_reasons: Array.isArray(row.score_reasons) ? row.score_reasons : [],
    suggested_collab_types: Array.isArray(row.suggested_collab_types)
      ? row.suggested_collab_types
      : [],
  };
}

/** CSV 出力用。カンバンの 100 件制限はかけず、その店舗の候補をすべて返す。 */
export async function listCandidatesForExport(
  organizationId: string,
  storeId: string,
): Promise<Candidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('store_id', storeId)
    .order('compatibility_score', { ascending: false, nullsFirst: false });

  if (error !== null) {
    throw new Error(`コラボ候補の取得に失敗しました: ${error.message}`);
  }

  return data ?? [];
}

export async function getCandidate(
  organizationId: string,
  candidateId: string,
): Promise<Candidate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', candidateId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`コラボ候補の取得に失敗しました: ${error.message}`);
  }

  return data;
}
