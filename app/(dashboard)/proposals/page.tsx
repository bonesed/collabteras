import { Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/features/layout/empty-state';
import { PageHeader } from '@/components/features/layout/page-header';
import { ProposalStatusBadge } from '@/components/features/proposals/proposal-status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireSessionContext } from '@/lib/auth';
import { COLLAB_TYPE_LABEL_MAP } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { listProposals } from '@/lib/queries/proposals';

export const metadata: Metadata = { title: '提案' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function ProposalsPage() {
  const { organization } = await requireSessionContext();
  const proposals = await listProposals(organization.id);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="提案"
        description="AI が生成したコラボ提案文と、その後のやり取りの状況を管理します。"
        action={
          <Button asChild>
            <Link href="/candidates">
              <Sparkles className="size-4" aria-hidden />
              候補から提案を作る
            </Link>
          </Button>
        }
      />

      {proposals.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="提案がまだありません"
          description="コラボ候補を選ぶと、その店舗に合わせた企画と挨拶文を AI が生成します。"
          action={
            <Button asChild>
              <Link href="/candidates">コラボ候補を見る</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>件名</TableHead>
                <TableHead className="hidden md:table-cell">相手店舗</TableHead>
                <TableHead className="hidden lg:table-cell">コラボ種別</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="hidden sm:table-cell text-right">
                  更新日
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.map((proposal) => (
                <TableRow key={proposal.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/proposals/${proposal.id}`}
                      className="hover:text-primary"
                    >
                      {proposal.subject}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {proposal.candidate.name}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {COLLAB_TYPE_LABEL_MAP[proposal.collab_type]}
                  </TableCell>
                  <TableCell>
                    <ProposalStatusBadge status={proposal.status} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right text-muted-foreground tabular-nums">
                    {formatDate(proposal.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
