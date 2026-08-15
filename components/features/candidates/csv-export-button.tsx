'use client';

import { Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { exportCandidatesCsv } from '@/app/(dashboard)/candidates/actions';
import { Button } from '@/components/ui/button';

interface CsvExportButtonProps {
  storeId: string;
  storeName: string;
  canExport: boolean;
}

export function CsvExportButton({
  storeId,
  storeName,
  canExport,
}: CsvExportButtonProps) {
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);

  if (!canExport) {
    return (
      <Button variant="outline" asChild>
        <Link href="/settings/billing">CSV 出力（プロプラン）</Link>
      </Button>
    );
  }

  function handleClick(): void {
    startTransition(async () => {
      setDownloading(true);
      try {
        const result = await exportCandidatesCsv(storeId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        const blob = new Blob([result.data], {
          type: 'text/csv;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${storeName.replace(/[\\/:*?"<>|]/g, '_')}-candidates.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
      } finally {
        setDownloading(false);
      }
    });
  }

  const busy = pending || downloading;

  return (
    <Button type="button" variant="outline" disabled={busy} onClick={handleClick}>
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      CSV 出力
    </Button>
  );
}
