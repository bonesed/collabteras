'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { deleteStore } from '@/app/(dashboard)/stores/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { StoreRelationCounts } from '@/lib/queries/stores';

interface StoreDeleteButtonProps {
  storeId: string;
  storeName: string;
  /** 一緒に消えるレコード数。何が失われるかを確認画面で具体的に示す */
  relations: StoreRelationCounts;
}

export function StoreDeleteButton({
  storeId,
  storeName,
  relations,
}: StoreDeleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function remove(): void {
    startTransition(async () => {
      const result = await deleteStore(storeId);

      if (!result.ok) {
        toast.error(result.error);
        setConfirming(false);
        return;
      }

      toast.success(`「${storeName}」を削除しました。`);
      router.push('/stores');
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" aria-hidden />
        この店舗を削除
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>「{storeName}」を削除しますか</DialogTitle>
            <DialogDescription>
              この店舗に紐づくコラボ候補 {relations.candidates} 件と提案{' '}
              {relations.proposals} 件も一緒に削除されます。この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setConfirming(false)}
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
    </>
  );
}
