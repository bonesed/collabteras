import Image from 'next/image';

import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
}

export function Logo({ className, showWordmark = true }: LogoProps) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Image
        src="/logo.png"
        // ワードマークを併記する場合、画像は装飾扱いにして読み上げの重複を避ける
        alt={showWordmark ? '' : APP_NAME}
        // 実寸(512px)ではなく表示サイズを渡し、小さい最適化画像だけを配信させる
        width={36}
        height={36}
        priority
        className="h-9 w-auto shrink-0 rounded-lg bg-white"
      />
      {showWordmark ? (
        <span className="text-base font-semibold tracking-tight">
          Collab<span className="text-primary">Teras</span>
        </span>
      ) : null}
    </span>
  );
}
