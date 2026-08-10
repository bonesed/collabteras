'use client';

import { Check, Loader2 } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { updateProposal } from '@/app/(dashboard)/proposals/actions';
import {
  CopyButton,
  copyText,
} from '@/components/features/proposals/copy-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { COLLAB_TYPE_LABELS, COLLAB_TYPE_PLAYBOOKS } from '@/lib/constants';
import type { ActionResult, CollabType, ProposalDetail } from '@/types';

/**
 * 保存済みの提案文を手直しする。文面の作り直し（AI 生成）はカルテ側の役割なので、
 * ここでは既にある文面の編集だけを扱う。
 */
export function ProposalDetailForm({ proposal }: { proposal: ProposalDetail }) {
  const [collabType, setCollabType] = useState<CollabType>(proposal.collab_type);
  const [subject, setSubject] = useState(proposal.subject);
  const [body, setBody] = useState(proposal.body);
  const [memo, setMemo] = useState(proposal.memo ?? '');

  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    updateProposal,
    null,
  );

  useEffect(() => {
    if (state !== null && state.ok) {
      toast.success('提案を保存しました。');
    }
  }, [state]);

  const isDirty =
    collabType !== proposal.collab_type ||
    subject !== proposal.subject ||
    body !== proposal.body ||
    memo !== (proposal.memo ?? '');

  const fieldErrors = state !== null && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="proposalId" value={proposal.id} />
      <input type="hidden" name="collabType" value={collabType} />

      <div className="space-y-2">
        <Label htmlFor="collabType">コラボ種別</Label>
        <Select
          value={collabType}
          onValueChange={(value) => setCollabType(value as CollabType)}
        >
          <SelectTrigger id="collabType" className="sm:w-72">
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
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="subject">件名 / 書き出しの一言</Label>
          <CopyButton text={subject} label="件名" variant="ghost" />
        </div>
        <Input
          id="subject"
          name="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={120}
        />
        <FieldError messages={fieldErrors?.subject} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="body">本文</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              {body.length} 文字
            </span>
            <CopyButton text={body} label="本文" />
          </div>
        </div>
        <Textarea
          id="body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={4000}
          rows={16}
          className="leading-relaxed"
        />
        <FieldError messages={fieldErrors?.body} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="memo">
          やり取りのメモ
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            任意
          </span>
        </Label>
        <Textarea
          id="memo"
          name="memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="例: 3/12 に Instagram の DM で送付。店長さんが不在のため来週あらためて連絡する。"
        />
        <p className="text-xs text-muted-foreground">
          いつ・どの経路で送ったか、相手の反応を残しておくと次の一手を決めやすくなります。
        </p>
        <FieldError messages={fieldErrors?.memo} />
      </div>

      {state !== null && !state.ok && state.fieldErrors === undefined ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SaveButton disabled={!isDirty} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void copyText(`${subject}\n\n${body}`, '件名と本文');
          }}
        >
          まとめてコピー
        </Button>
        {isDirty ? (
          <span className="text-xs text-muted-foreground">未保存の変更があります</span>
        ) : null}
      </div>
    </form>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Check className="size-4" aria-hidden />
      )}
      {pending ? '保存中…' : '変更を保存'}
    </Button>
  );
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (messages === undefined || messages.length === 0) {
    return null;
  }
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}
