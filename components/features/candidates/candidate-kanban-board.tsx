'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { updateCandidateStage } from '@/app/(dashboard)/candidates/actions';
import { CandidateCard } from '@/components/features/candidates/candidate-card';
import { ProposalComposerDialog } from '@/components/features/proposals/proposal-composer-dialog';
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGE_LABEL_MAP } from '@/lib/constants';
import { resolveStage } from '@/lib/pipeline';
import { cn } from '@/lib/utils';
import type { CandidateWithProposals, PipelineStage } from '@/types';

interface CandidateKanbanBoardProps {
  storeName: string;
  candidates: CandidateWithProposals[];
  /** 遷移直後に開いておくカルテ。/proposals/new からの導線で使う */
  initialCandidateId?: string;
}

interface StageChange {
  id: string;
  stage: PipelineStage;
}

export function CandidateKanbanBoard({
  storeName,
  candidates,
  initialCandidateId,
}: CandidateKanbanBoardProps) {
  // サーバーの再検証が終わるまでの間だけ、移動先の列を先に反映する。
  const [pendingStages, applyStageChange] = useOptimistic<
    Record<string, PipelineStage>,
    StageChange
  >({}, (current, change) => ({ ...current, [change.id]: change.stage }));

  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(
    initialCandidateId ?? null,
  );

  function stageOf(candidate: CandidateWithProposals): PipelineStage {
    return pendingStages[candidate.id] ?? resolveStage(candidate);
  }

  function moveTo(candidate: CandidateWithProposals, stage: PipelineStage): void {
    if (stageOf(candidate) === stage) {
      return;
    }

    startTransition(async () => {
      applyStageChange({ id: candidate.id, stage });

      const result = await updateCandidateStage(candidate.id, stage);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `「${candidate.name}」を${PIPELINE_STAGE_LABEL_MAP[stage]}に移しました。`,
      );
    });
  }

  function handleDrop(stage: PipelineStage, candidateId: string): void {
    const candidate = candidates.find((item) => item.id === candidateId);

    if (candidate !== undefined) {
      moveTo(candidate, stage);
    }
  }

  const openCandidate =
    candidates.find((candidate) => candidate.id === openCandidateId) ?? null;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGE_LABELS.map((column) => {
          const columnCandidates = candidates.filter(
            (candidate) => stageOf(candidate) === column.value,
          );

          return (
            <section
              key={column.value}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverStage(column.value);
              }}
              onDragLeave={() => {
                setDragOverStage((current) =>
                  current === column.value ? null : current,
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOverStage(null);
                handleDrop(column.value, event.dataTransfer.getData('text/plain'));
              }}
              className={cn(
                'flex w-72 shrink-0 flex-col gap-2 rounded-lg border bg-muted/40 p-2 transition-colors',
                dragOverStage === column.value && 'border-primary bg-primary/5',
              )}
            >
              <header className="flex items-center justify-between gap-2 px-1 py-0.5">
                <h2 className="text-sm font-medium">{column.label}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {columnCandidates.length}
                </span>
              </header>

              {columnCandidates.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  ここにカードをドラッグ
                </p>
              ) : (
                columnCandidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    stage={column.value}
                    isDragging={draggingId === candidate.id}
                    onOpen={() => setOpenCandidateId(candidate.id)}
                    onDragStart={() => setDraggingId(candidate.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onStageChange={(stage) => moveTo(candidate, stage)}
                  />
                ))
              )}
            </section>
          );
        })}
      </div>

      <ProposalComposerDialog
        candidate={openCandidate}
        storeName={storeName}
        onClose={() => setOpenCandidateId(null)}
      />
    </>
  );
}
