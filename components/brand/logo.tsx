import { Handshake } from 'lucide-react';

import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
}

export function Logo({ className, showWordmark = true }: LogoProps) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Handshake className="size-4" aria-hidden />
      </span>
      {showWordmark ? (
        <span className="text-base font-semibold tracking-tight">
          Collab<span className="text-primary">Teras</span>
        </span>
      ) : null}
    </span>
  );
}
