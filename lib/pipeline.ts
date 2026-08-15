/**
 * カンバンの列（PipelineStage）と、DB 側の状態（candidates.is_dismissed と
 * proposals.status）の対応。サーバーの Server Action とクライアントのボードの
 * 両方から使うため、`server-only` は付けない。
 */

import type {
  CandidateWithProposals,
  PipelineStage,
  ProposalStatus,
  TablesUpdate,
} from '@/types';

type ProposalSummary = CandidateWithProposals['proposals'][number];

/** アーカイブ済みは「なかったこと」として扱い、未アプローチに戻す。 */
const STATUS_TO_STAGE: Readonly<Record<ProposalStatus, PipelineStage | null>> = {
  draft: 'drafted',
  ready: 'drafted',
  sent: 'sent',
  replied: 'replied',
  agreed: 'agreed',
  declined: 'declined',
  archived: null,
};

export const STAGE_TO_PROPOSAL_STATUS: Readonly<
  Record<PipelineStage, ProposalStatus>
> = {
  not_started: 'archived',
  drafted: 'ready',
  sent: 'sent',
  replied: 'replied',
  agreed: 'agreed',
  declined: 'declined',
};

/** 提案文がないと移動できない列。カードをここへ落とす前に生成が必要。 */
export const STAGES_REQUIRING_PROPOSAL: readonly PipelineStage[] = [
  'drafted',
  'sent',
  'replied',
  'agreed',
];

/**
 * その候補に対して「いま生きている」提案。
 * 提案は更新日の新しい順に並んでいる前提で、アーカイブ済みを飛ばして先頭を返す。
 */
export function findActiveProposal(
  proposals: readonly ProposalSummary[] | null | undefined,
): ProposalSummary | null {
  return proposals?.find((proposal) => proposal.status !== 'archived') ?? null;
}

export function resolveStage(candidate: CandidateWithProposals): PipelineStage {
  if (candidate.is_dismissed) {
    return 'declined';
  }

  const proposal = findActiveProposal(candidate.proposals);
  if (proposal === null) {
    return 'not_started';
  }

  return STATUS_TO_STAGE[proposal.status] ?? 'not_started';
}

/**
 * ステータス変更を proposals の更新値に変換する。
 * 送付日・返信日は最初にそのステータスへ入ったときだけ記録し、
 * 行き来しても上書きしない。
 */
export function toProposalStatusUpdate(
  status: ProposalStatus,
  current: { sent_at: string | null; replied_at: string | null },
): TablesUpdate<'proposals'> {
  const now = new Date().toISOString();

  return {
    status,
    updated_at: now,
    ...(status === 'sent' && current.sent_at === null ? { sent_at: now } : {}),
    ...(status === 'replied' && current.replied_at === null
      ? { replied_at: now }
      : {}),
  };
}
