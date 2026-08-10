import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          ページが見つかりません
        </h1>
        <p className="text-sm text-muted-foreground">
          URL が変更されたか、削除された可能性があります。
        </p>
      </div>
      <Button asChild>
        <Link href="/">トップへ戻る</Link>
      </Button>
    </div>
  );
}
