import { Badge } from '@/components/ui/badge';
import { PROPOSAL_STATUS_LABEL_MAP } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ProposalStatus } from '@/types';

const STATUS_STYLES: Readonly<Record<ProposalStatus, string>> = {
  draft: 'bg-muted text-muted-foreground',
  ready: 'bg-brand-100 text-brand-800',
  sent: 'bg-sky-100 text-sky-800',
  replied: 'bg-amber-100 text-amber-900',
  agreed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-rose-100 text-rose-800',
  archived: 'bg-muted text-muted-foreground',
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn('shrink-0 border-none', STATUS_STYLES[status])}
    >
      {PROPOSAL_STATUS_LABEL_MAP[status]}
    </Badge>
  );
}
