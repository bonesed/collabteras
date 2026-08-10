'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">画面の読み込みに失敗しました</h1>
      <p className="text-sm text-muted-foreground">
        一時的な問題の可能性があります。再読み込みしても改善しない場合はお問い合わせください。
      </p>
      <Button onClick={reset}>再試行</Button>
    </div>
  );
}
