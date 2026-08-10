'use client';

import {
  Check,
  Copy,
  ExternalLink,
  Footprints,
  Globe,
  Loader2,
  MapPin,
  Phone,
  Sparkles,
  Star,
} from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { CompatibilityScoreBadge } from '@/components/features/candidates/compatibility-score-badge';
import {
  CopyButton,
  copyText,
} from '@/components/features/proposals/copy-button';
import { ProposalStatusBadge } from '@/components/features/proposals/proposal-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  generateProposalDraft,
  saveProposal,
} from '@/app/(dashboard)/proposals/actions';
import {
  COLLAB_TYPE_LABELS,
  COLLAB_TYPE_LABEL_MAP,
  COLLAB_TYPE_PLAYBOOKS,
  PROPOSAL_TONE_LABELS,
} from '@/lib/constants';
import { formatDistance } from '@/lib/format';
import { findActiveProposal } from '@/lib/pipeline';
import type {
  ActionResult,
  Candidate,
  CandidateWithProposals,
  CollabType,
  GeneratedProposal,
  ProposalTone,
  SavedProposalRef,
} from '@/types';

interface ProposalComposerDialogProps {
  candidate: CandidateWithProposals | null;
  storeName: string;
  onClose: () => void;
}

/**
 * 店舗カルテと提案文の生成をまとめたモーダル。
 * 候補を切り替えたら編集中の内容を持ち越さないよう、中身は key で作り直す。
 */
export function ProposalComposerDialog({
  candidate,
  storeName,
  onClose,
}: ProposalComposerDialogProps) {
  return (
    <Dialog
      open={candidate !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {candidate === null ? null : (
          <ProposalComposer
            key={candidate.id}
            candidate={candidate}
            storeName={storeName}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProposalComposer({
  candidate,
  storeName,
}: {
  candidate: CandidateWithProposals;
  storeName: string;
}) {
  const existing = findActiveProposal(candidate.proposals);

  const [collabType, setCollabType] = useState<CollabType>(
    existing?.collab_type ?? candidate.suggested_collab_types[0] ?? 'coupon_exchange',
  );
  const [tone, setTone] = useState<ProposalTone>('friendly');
  const [additionalContext, setAdditionalContext] = useState('');
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  // 保存先の提案。生成し直したときは null に戻し、新しい版として積む。
  const [proposalId, setProposalId] = useState(existing?.id ?? '');

  const [generateState, generateAction] = useActionState<
    ActionResult<GeneratedProposal> | null,
    FormData
  >(generateProposalDraft, null);

  const [saveState, saveAction] = useActionState<
    ActionResult<SavedProposalRef> | null,
    FormData
  >(saveProposal, null);

  useEffect(() => {
    if (generateState === null || !generateState.ok) {
      return;
    }

    setSubject(generateState.data.subject);
    setBody(generateState.data.body);
    setModel(generateState.data.model);
    setProposalId('');
  }, [generateState]);

  useEffect(() => {
    if (saveState === null || !saveState.ok) {
      return;
    }

    setProposalId(saveState.data.id);
    toast.success('提案文を保存しました。');
  }, [saveState]);

  const hasDraft = subject.trim() !== '' && body.trim() !== '';

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 pr-6">
          <span className="min-w-0 truncate">{candidate.name}</span>
          <CompatibilityScoreBadge score={candidate.compatibility_score} />
          {existing === null ? null : <ProposalStatusBadge status={existing.status} />}
        </DialogTitle>
        <DialogDescription>
          {storeName} から {candidate.name} へ送るコラボのお声がけ文をつくります。
        </DialogDescription>
      </DialogHeader>

      <CandidateProfile candidate={candidate} />

      <Separator />

      <form action={generateAction} className="space-y-4">
        <input type="hidden" name="candidateId" value={candidate.id} />
        <input type="hidden" name="collabType" value={collabType} />
        <input type="hidden" name="tone" value={tone} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="collabType">提案タイプ</Label>
            <Select
              value={collabType}
              onValueChange={(value) => setCollabType(value as CollabType)}
            >
              <SelectTrigger id="collabType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLAB_TYPE_LABELS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {COLLAB_TYPE_PLAYBOOKS[collabType]}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tone">トーン＆マナー</Label>
            <Select
              value={tone}
              onValueChange={(value) => setTone(value as ProposalTone)}
            >
              <SelectTrigger id="tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPOSAL_TONE_LABELS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              送る経路に合わせて、文体と長さが変わります。
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="additionalContext">
            伝えたいこと
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              任意
            </span>
          </Label>
          <Textarea
            id="additionalContext"
            name="additionalContext"
            value={additionalContext}
            onChange={(event) => setAdditionalContext(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="例: 初回は 1 か月だけ小さく試したい / 平日の昼が空いているのでそこを埋めたい"
          />
        </div>

        {generateState !== null && !generateState.ok ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {generateState.error}
          </p>
        ) : null}

        <GenerateButton hasDraft={hasDraft} />
      </form>

      <Separator />

      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="candidateId" value={candidate.id} />
        <input type="hidden" name="collabType" value={collabType} />
        <input type="hidden" name="tone" value={tone} />
        <input type="hidden" name="additionalContext" value={additionalContext} />
        <input type="hidden" name="proposalId" value={proposalId} />
        <input type="hidden" name="model" value={model} />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="subject">件名 / 書き出しの一言</Label>
            <CopyButton
              text={subject}
              label="件名"
              variant="ghost"
              size="sm"
            />
          </div>
          <Input
            id="subject"
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={120}
            placeholder="生成するか、直接入力してください"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="body">本文</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {body.length} 文字
              </span>
              <CopyButton text={body} label="本文" variant="outline" size="sm" />
            </div>
          </div>
          <Textarea
            id="body"
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            rows={12}
            className="font-normal leading-relaxed"
            placeholder="生成された本文はここに入ります。そのまま編集できます。"
          />
          <p className="text-xs text-muted-foreground">
            送る前に、店名や日付が正しいかを必ず確認してください。
          </p>
        </div>

        {saveState !== null && !saveState.ok ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {saveState.error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <SaveButton disabled={!hasDraft} />
          <Button
            type="button"
            variant="secondary"
            disabled={!hasDraft}
            onClick={() => {
              void copyText(
                `${subject}\n\n${body}`,
                '件名と本文',
              );
            }}
          >
            <Copy className="size-4" aria-hidden />
            まとめてコピー
          </Button>
        </div>
      </form>
    </>
  );
}

function CandidateProfile({ candidate }: { candidate: Candidate }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    candidate.name,
  )}&query_place_id=${candidate.google_place_id}`;

  return (
    <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {candidate.category === null ? null : <span>{candidate.category}</span>}
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
            {candidate.user_ratings_total === null
              ? null
              : `（${candidate.user_ratings_total} 件）`}
          </span>
        )}
        {candidate.address === null ? null : (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {candidate.address}
          </span>
        )}
      </div>

      {candidate.score_reasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          相性はまだ判定されていません。近隣抽出をやり直すと算出されます。
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            AI が相性が良いと判断した理由
          </p>
          <ul className="space-y-1 text-sm">
            {candidate.score_reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidate.suggested_collab_types.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">おすすめの組み方</span>
          {candidate.suggested_collab_types.map((type) => (
            <Badge key={type} variant="outline" className="font-normal">
              {COLLAB_TYPE_LABEL_MAP[type]}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={mapsUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" aria-hidden />
            Google Maps
          </a>
        </Button>
        {candidate.website === null ? null : (
          <Button variant="outline" size="sm" asChild>
            <a href={candidate.website} target="_blank" rel="noreferrer">
              <Globe className="size-4" aria-hidden />
              サイト
            </a>
          </Button>
        )}
        {candidate.phone === null ? null : (
          <Button variant="outline" size="sm" asChild>
            <a href={`tel:${candidate.phone}`}>
              <Phone className="size-4" aria-hidden />
              {candidate.phone}
            </a>
          </Button>
        )}
      </div>
    </section>
  );
}

function GenerateButton({ hasDraft }: { hasDraft: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-4" aria-hidden />
      )}
      {pending
        ? 'AI が書いています…'
        : hasDraft
          ? 'この条件で書き直す'
          : 'AI に提案文を書いてもらう'}
    </Button>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" disabled={disabled || pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Check className="size-4" aria-hidden />
      )}
      {pending ? '保存中…' : '保存する'}
    </Button>
  );
}
