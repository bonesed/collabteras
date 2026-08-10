'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult, Store } from '@/types';

interface StoreFormProps {
  action: (
    prevState: ActionResult<null> | null,
    formData: FormData,
  ) => Promise<ActionResult<null>>;
  /** 編集時のみ渡す。初期値と、更新対象を伝える hidden の値に使う */
  store?: Store;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {label}
    </Button>
  );
}

function FieldError({ messages }: { messages: string[] | undefined }) {
  if (messages === undefined || messages.length === 0) {
    return null;
  }
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

export function StoreForm({ action, store }: StoreFormProps) {
  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    action,
    null,
  );

  useEffect(() => {
    if (state !== null && state.ok) {
      toast.success('店舗情報を保存しました。');
    }
  }, [state]);

  const fieldErrors = state !== null && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-6">
      {store === undefined ? null : (
        <input type="hidden" name="storeId" value={store.id} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">店舗名</Label>
          <Input
            id="name"
            name="name"
            defaultValue={store?.name}
            placeholder="カフェ テラス 中目黒店"
            required
          />
          <FieldError messages={fieldErrors?.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">業種</Label>
          <Input
            id="category"
            name="category"
            defaultValue={store?.category}
            placeholder="カフェ / 美容室 / 書店"
            required
          />
          <FieldError messages={fieldErrors?.category} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">住所</Label>
        <Input
          id="address"
          name="address"
          defaultValue={store?.address ?? ''}
          placeholder="東京都目黒区青葉台1-2-3"
          autoComplete="street-address"
        />
        <p className="text-xs text-muted-foreground">
          近隣店舗の抽出範囲を決めるために使用します。
          {store === undefined
            ? null
            : ' 変更すると緯度経度を取り直し、次回の抽出範囲が移動します。'}
        </p>
        <FieldError messages={fieldErrors?.address} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">
          Web サイト<span className="ml-1 text-muted-foreground">（任意）</span>
        </Label>
        <Input
          id="website"
          name="website"
          type="url"
          defaultValue={store?.website ?? ''}
          placeholder="https://example.com"
        />
        <FieldError messages={fieldErrors?.website} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          お店の紹介<span className="ml-1 text-muted-foreground">（任意）</span>
        </Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={store?.description ?? ''}
          placeholder="自家焙煎コーヒーと焼き菓子の小さなカフェ。平日は在宅ワーク利用が多め。"
        />
        <FieldError messages={fieldErrors?.description} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="targetCustomer">
            来てほしいお客様<span className="ml-1 text-muted-foreground">（任意）</span>
          </Label>
          <Textarea
            id="targetCustomer"
            name="targetCustomer"
            rows={3}
            defaultValue={store?.target_customer ?? ''}
            placeholder="30代の女性、休日に街歩きを楽しむ層"
          />
          <FieldError messages={fieldErrors?.targetCustomer} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="strengths">
            お店の強み<span className="ml-1 text-muted-foreground">（任意）</span>
          </Label>
          <Textarea
            id="strengths"
            name="strengths"
            rows={3}
            defaultValue={store?.strengths ?? ''}
            placeholder="イベントスペースとして貸し出せる / Instagram のフォロワーが 8,000 人"
          />
          <FieldError messages={fieldErrors?.strengths} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        紹介・お客様像・強みは、AI がコラボ企画と提案文を組み立てるときの材料になります。
      </p>

      {state !== null && !state.ok && state.fieldErrors === undefined ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton label={store === undefined ? '登録する' : '変更を保存'} />
        <Button type="button" variant="ghost" asChild>
          <Link href="/stores">
            {store === undefined ? 'キャンセル' : '自店舗に戻る'}
          </Link>
        </Button>
      </div>
    </form>
  );
}
