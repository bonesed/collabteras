import { Construction } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

interface ComingSoonProps {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}

/** 実装予定の画面。ルーティングと導線だけ先に用意しておくための暫定表示。 */
export function ComingSoon({
  title,
  description,
  backHref,
  backLabel,
}: ComingSoonProps) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Construction className="size-6" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button variant="outline" asChild>
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );
}
