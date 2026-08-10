'use client';

import { Loader2, MapPinned } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  PLACE_CATEGORY_OPTIONS,
  SEARCH_RADIUS_OPTIONS,
} from '@/lib/constants';
import type { ActionResult } from '@/types';

interface NearbySearchFormProps {
  storeId: string;
  defaultRadiusMeters: number;
  action: (
    prevState: ActionResult<null> | null,
    formData: FormData,
  ) => Promise<ActionResult<null>>;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <MapPinned className="size-4" aria-hidden />
      )}
      {pending ? '抽出中…（1 分ほどかかります）' : '近隣を抽出する'}
    </Button>
  );
}

export function NearbySearchForm({
  storeId,
  defaultRadiusMeters,
  action,
}: NearbySearchFormProps) {
  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="storeId" value={storeId} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">検索範囲</legend>
        <div className="flex flex-wrap gap-2">
          {SEARCH_RADIUS_OPTIONS.map((radius) => (
            <label
              key={radius}
              className="cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
            >
              <input
                type="radio"
                name="radiusMeters"
                value={radius}
                defaultChecked={radius === defaultRadiusMeters}
                className="sr-only"
              />
              {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          業種で絞り込む
          <span className="ml-2 font-normal text-muted-foreground">
            未選択なら全業種
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {PLACE_CATEGORY_OPTIONS.map((category) => (
            <label
              key={category.value}
              className="cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
            >
              <input
                type="checkbox"
                name="categories"
                value={category.value}
                className="sr-only"
              />
              {category.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label className="text-sm font-medium">この抽出で行われること</Label>
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Google Maps から指定範囲内の店舗を取得します</li>
          <li>AI が自店舗との相性を 0-100 で採点し、その理由を添えます</li>
          <li>すでに抽出済みの店舗は最新の情報で上書きします</li>
        </ol>
      </div>

      {state !== null && !state.ok ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton />
        <Button type="button" variant="ghost" asChild>
          <Link href={`/candidates?store=${storeId}`}>キャンセル</Link>
        </Button>
      </div>
    </form>
  );
}
