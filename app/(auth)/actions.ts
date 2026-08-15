'use server';

import type { AuthError } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { publicEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

const DEFAULT_REDIRECT = '/dashboard';

const credentialsSchema = z.object({
  email: z.string().email('メールアドレスの形式が正しくありません。'),
  password: z.string().min(8, 'パスワードは 8 文字以上で入力してください。'),
});

const signUpSchema = credentialsSchema.extend({
  fullName: z.string().min(1, 'お名前を入力してください。'),
});

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/** オープンリダイレクトを防ぐため、アプリ内の絶対パスだけを許可する。 */
function safeRedirectTo(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') {
    return DEFAULT_REDIRECT;
  }
  if (!value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_REDIRECT;
  }
  return value;
}

/**
 * Supabase 側の設定ミスや通信断を「認証情報が違う」と誤表示しないよう、
 * ネットワーク/サーバー由来のエラーだけ切り分ける。
 */
function isConnectionError(error: AuthError): boolean {
  return error.status === undefined || error.status === 0 || error.status >= 500;
}

export async function signIn(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: '入力内容をご確認ください。',
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const redirectTo = safeRedirectTo(formData.get('redirectTo'));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error !== null) {
    if (isConnectionError(error)) {
      return {
        ok: false,
        error: '認証サーバーに接続できませんでした。時間をおいてお試しください。',
      };
    }
    if (error.code === 'email_not_confirmed') {
      return {
        ok: false,
        error:
          'メールアドレスの確認が完了していません。受信した確認メールのリンクを開いてください。',
      };
    }
    return {
      ok: false,
      error: 'メールアドレスまたはパスワードが正しくありません。',
    };
  }

  revalidatePath('/', 'layout');
  redirect(redirectTo);
}

export async function signUp(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: '入力内容をご確認ください。',
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const redirectTo = safeRedirectTo(formData.get('redirectTo'));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL || 'https://collabteras.vercel.app'}/auth/callback`,
    },
  });

  if (error !== null) {
    if (isConnectionError(error)) {
      return {
        ok: false,
        error: '認証サーバーに接続できませんでした。時間をおいてお試しください。',
      };
    }
    if (error.code === 'user_already_exists') {
      return {
        ok: false,
        error: 'このメールアドレスは既に登録されています。ログインしてください。',
      };
    }
    if (error.code === 'weak_password') {
      return {
        ok: false,
        error: 'パスワードが簡単すぎます。英数字を混ぜて設定してください。',
        fieldErrors: { password: ['パスワードが簡単すぎます。'] },
      };
    }
    return { ok: false, error: '登録に失敗しました。時間をおいてお試しください。' };
  }

  // メール確認が有効な場合、Supabase は既存アドレスでもエラーを返さない。
  // identities が空であることが「登録済み」の唯一の手掛かりになる。
  if (data.user !== null && data.user.identities?.length === 0) {
    return {
      ok: false,
      error: 'このメールアドレスは既に登録されています。ログインしてください。',
    };
  }

  // メール確認が必須の設定だとセッションが発行されない。
  // その場合はダッシュボードに入れないので、確認を促す画面に送る。
  if (data.session === null) {
    redirect('/login?status=confirm_email');
  }

  revalidatePath('/', 'layout');
  redirect(redirectTo);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login?status=signed_out');
}
