'use client';

import { Loader2 } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/types';

type AuthAction = (
  prevState: ActionResult<null> | null,
  formData: FormData,
) => Promise<ActionResult<null>>;

interface AuthFormProps {
  mode: 'signin' | 'signup';
  action: AuthAction;
  /** 認証後の遷移先。middleware が付ける `redirect_to` を引き継ぐ */
  redirectTo?: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending}>
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

export function AuthForm({ mode, action, redirectTo }: AuthFormProps) {
  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    action,
    null,
  );

  const fieldErrors = state !== null && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4">
      {redirectTo === undefined ? null : (
        <input type="hidden" name="redirectTo" value={redirectTo} />
      )}

      {mode === 'signup' ? (
        <div className="space-y-2">
          <Label htmlFor="fullName">お名前</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required />
          <FieldError messages={fieldErrors?.fullName} />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="owner@example.com"
          required
        />
        <FieldError messages={fieldErrors?.email} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">パスワード</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
        />
        <FieldError messages={fieldErrors?.password} />
      </div>

      {state !== null && !state.ok && state.fieldErrors === undefined ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton label={mode === 'signup' ? 'アカウントを作成' : 'ログイン'} />
    </form>
  );
}
