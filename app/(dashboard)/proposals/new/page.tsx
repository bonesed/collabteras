import { redirect } from 'next/navigation';

import { requireSessionContext } from '@/lib/auth';
import { getCandidate } from '@/lib/queries/candidates';

interface NewProposalPageProps {
  searchParams: Promise<{ candidate?: string }>;
}

/**
 * 提案文の作成はコラボ候補のカンバン上のモーダルに統合したため、
 * 候補が分かる場合はその店舗カルテを開いた状態のカンバンへ送る。
 */
export default async function NewProposalPage({
  searchParams,
}: NewProposalPageProps) {
  const { candidate: candidateId } = await searchParams;

  if (candidateId === undefined) {
    redirect('/candidates');
  }

  const { organization } = await requireSessionContext();
  const candidate = await getCandidate(organization.id, candidateId);

  if (candidate === null) {
    redirect('/candidates');
  }

  redirect(`/candidates?store=${candidate.store_id}&candidate=${candidate.id}`);
}
