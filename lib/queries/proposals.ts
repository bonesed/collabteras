import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { ProposalDetail, ProposalStatus, ProposalWithCandidate } from '@/types';

interface ListProposalsOptions {
  storeId?: string;
  statuses?: ProposalStatus[];
  limit?: number;
}

export async function listProposals(
  organizationId: string,
  options: ListProposalsOptions = {},
): Promise<ProposalWithCandidate[]> {
  const { storeId, statuses, limit = 50 } = options;

  const supabase = await createClient();
  let query = supabase
    .from('proposals')
    .select('*, candidate:candidates!inner(id, name, category, photo_url)')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (storeId !== undefined) {
    query = query.eq('store_id', storeId);
  }
  if (statuses !== undefined && statuses.length > 0) {
    query = query.in('status', statuses);
  }

  const { data, error } = await query;

  if (error !== null) {
    throw new Error(`提案の取得に失敗しました: ${error.message}`);
  }

  return data;
}

/** 詳細画面用に、相手店舗と発信元店舗を添えて 1 件取得する */
export async function getProposal(
  organizationId: string,
  proposalId: string,
): Promise<ProposalDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proposals')
    .select(
      '*, candidate:candidates!inner(*), store:stores!inner(id, name, category)',
    )
    .eq('organization_id', organizationId)
    .eq('id', proposalId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`提案の取得に失敗しました: ${error.message}`);
  }

  return data;
}

/**
 * 当月に保存した提案文の件数。プランの上限判定に使う。
 * 生成し直して保存すると新しい行が積まれるため、AI が書いた通数とほぼ一致する。
 */
export async function countProposalsThisMonth(
  organizationId: string,
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const supabase = await createClient();
  const { count, error } = await supabase
    .from('proposals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', monthStart);

  if (error !== null) {
    throw new Error(`提案数の集計に失敗しました: ${error.message}`);
  }

  return count ?? 0;
}

/** その候補に紐づく、アーカイブされていない最新の提案 */
export async function getActiveProposalForCandidate(
  organizationId: string,
  candidateId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proposals')
    .select('id, status, sent_at, replied_at')
    .eq('organization_id', organizationId)
    .eq('candidate_id', candidateId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`提案の取得に失敗しました: ${error.message}`);
  }

  return data;
}
