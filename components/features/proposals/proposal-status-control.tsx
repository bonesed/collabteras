'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  deleteProposal,
  updateProposalStatus,
} from '@/app/(dashboard)/proposals/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_LABEL_MAP,
} from '@/lib/constants';
import type { ProposalStatus } from '@/types';

interface ProposalStatusControlProps {
  proposalId: string;
  status: ProposalStatus;
  /** 削除の確認ダイアログに出す相手店舗名 */
  candidateName: string;
}

export function ProposalStatusControl({
  proposalId,
  status,
  candidateName,
}: ProposalStatusControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 再検証が終わるまでの間だけ、選んだステータスを先に見せる。
  const [shownStatus, showStatus] = useOptimistic(status);

  function changeStatus(next: ProposalStatus): void {
    if (next === shownStatus) {
      return;
    }

    startTransition(async () => {
      showStatus(next);

      const result = await updateProposalStatus(proposalId, next);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `ステータスを「${PROPOSAL_STATUS_LABEL_MAP[next]}」に変更しました。`,
      );
    });
  }

  function remove(): void {
    startTransition(async () => {
      const result = await deleteProposal(proposalId);

      if (!result.ok) {
        toast.error(result.error);
        setConfirmingDelete(false);
        return;
      }

      toast.success('提案を削除しました。');
      router.push('/proposals');
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={shownStatus}
        onValueChange={(value) => changeStatus(value as ProposalStatus)}
        disabled={isPending}
      >
        <SelectTrigger className="w-44" aria-label="提案のステータス">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROPOSAL_STATUS_LABELS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="この提案を削除"
        disabled={isPending}
        onClick={() => setConfirmingDelete(true)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>この提案を削除しますか</DialogTitle>
            <DialogDescription>
              {candidateName} 宛ての提案文とメモが消えます。この操作は元に戻せません。
              コラボ候補そのものは残るので、あらためて書き直せます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setConfirmingDelete(false)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={remove}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
