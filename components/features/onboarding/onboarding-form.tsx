'use client';

import { Loader2 } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/types';

interface OnboardingFormProps {
  action: (
    prevState: ActionResult<null> | null,
    formData: FormData,
  ) => Promise<ActionResult<null>>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      作成して次へ
    </Button>
  );
}

export function OnboardingForm({ action }: OnboardingFormProps) {
  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    action,
    null,
  );

  const errorMessage =
    state !== null && !state.ok
      ? (state.fieldErrors?.organizationName?.[0] ?? state.error)
      : null;

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="organizationName">組織名</Label>
        <Input
          id="organizationName"
          name="organizationName"
          placeholder="株式会社コラボテラス / カフェ テラス"
          autoComplete="organization"
          required
        />
        {errorMessage === null ? null : (
          <p className="text-xs text-destructive">{errorMessage}</p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}
