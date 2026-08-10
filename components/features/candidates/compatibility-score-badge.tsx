import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function scoreToneClass(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800';
  if (score >= 60) return 'bg-brand-100 text-brand-800';
  if (score >= 40) return 'bg-amber-100 text-amber-900';
  return 'bg-muted text-muted-foreground';
}

interface CompatibilityScoreBadgeProps {
  score: number | null;
  className?: string;
}

export function CompatibilityScoreBadge({
  score,
  className,
}: CompatibilityScoreBadgeProps) {
  if (score === null) {
    return null;
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        'shrink-0 border-none tabular-nums',
        scoreToneClass(score),
        className,
      )}
    >
      相性 {score}
    </Badge>
  );
}
