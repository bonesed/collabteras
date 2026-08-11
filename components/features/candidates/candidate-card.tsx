'use client';

import { Footprints, GripVertical, Sparkles, Star } from 'lucide-react';
import { useRef } from 'react';

import { CompatibilityScoreBadge } from '@/components/features/candidates/compatibility-score-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COLLAB_TYPE_LABEL_MAP, PIPELINE_STAGE_LABELS } from '@/lib/constants';
import { formatDistance } from '@/lib/format';
import { findActiveProposal } from '@/lib/pipeline';
import { cn } from '@/lib/utils';
import type { CandidateWithProposals, PipelineStage } from '@/types';

interface CandidateCardProps {
  candidate: CandidateWithProposals;
  stage: PipelineStage;
  isDragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStageChange: (stage: PipelineStage) => void;
}

export function CandidateCard({
  candidate,
  stage,
  isDragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onStageChange,
}: CandidateCardProps) {
  const proposal = findActiveProposal(candidate.proposals);
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <Card
      ref={cardRef}
      className={cn(
        'overflow-hidden transition-colors hover:border-primary/40',
        isDragging && 'opacity-50',
      )}
    >
      {/* キーボード操作は下部の「提案文を作成 / カルテを開く」ボタンが担うため、
          ここでのクリックはポインター向けの補助的な導線として扱う。 */}
      <div className="cursor-pointer space-y-2 p-3" onClick={onOpen}>
        <div className="flex items-start gap-2">
          {/* ドラッグの起点はこのグリップだけに絞り、カード本体のタップを潰さない */}
          <span
            draggable
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', candidate.id);
              event.dataTransfer.effectAllowed = 'move';

              if (cardRef.current !== null) {
                // 掴んだのがグリップだけでも、ドラッグ中はカード全体を表示する。
                event.dataTransfer.setDragImage(cardRef.current, 16, 16);
              }

              onDragStart();
            }}
            onDragEnd={onDragEnd}
            className="mt-0.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
            aria-hidden
          >
            <GripVertical className="size-4" />
          </span>
          {candidate.photo_url === null ? null : (
            // Places の写真は自前プロキシ経由で都度取得するため、最適化は挟まない。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={candidate.photo_url}
              alt=""
              className="size-9 shrink-0 rounded-md object-cover"
              loading="lazy"
              draggable={false}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{candidate.name}</p>
            {candidate.category === null ? null : (
              <p className="truncate text-xs text-muted-foreground">
                {candidate.category}
              </p>
            )}
          </div>
          <CompatibilityScoreBadge
            score={candidate.compatibility_score}
            className="text-[11px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted-foreground">
          {candidate.distance_meters === null ? null : (
            <span className="flex items-center gap-1">
              <Footprints className="size-3.5" aria-hidden />
              {formatDistance(candidate.distance_meters)}
            </span>
          )}
          {candidate.rating === null ? null : (
            <span className="flex items-center gap-1">
              <Star className="size-3.5" aria-hidden />
              {candidate.rating.toFixed(1)}
            </span>
          )}
        </div>

        {candidate.score_reasons[0] === undefined ? null : (
          <p className="line-clamp-2 pl-6 text-xs leading-relaxed text-muted-foreground">
            {candidate.score_reasons[0]}
          </p>
        )}

        {proposal === null ? null : (
          <p className="truncate pl-6 text-xs text-muted-foreground">
            {COLLAB_TYPE_LABEL_MAP[proposal.collab_type]}・{proposal.subject}
          </p>
        )}
      </div>

      {/* 下段はクリック領域の外側だが、伝播も明示的に止めてカルテの誤爆を防ぐ */}
      <div className="flex items-center gap-2 border-t bg-muted/30 p-2">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <Sparkles className="size-4" aria-hidden />
          {proposal === null ? '提案文を作成' : 'カルテを開く'}
        </Button>
        <Select
          value={stage}
          onValueChange={(value) => onStageChange(value as PipelineStage)}
        >
          <SelectTrigger
            className="h-8 w-[7.5rem] text-xs"
            aria-label={`${candidate.name} のステータス`}
            onClick={(event) => event.stopPropagation()}
          >
            <SelectValue />
          </SelectTrigger>
          {/* ポータル配下でも React のツリーを辿って伝播するため、ここでも止める */}
          <SelectContent onClick={(event) => event.stopPropagation()}>
            {PIPELINE_STAGE_LABELS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}
