'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

const schema = z.object({
  organizationName: z
    .string()
    .min(1, '組織名を入力してください。')
    .max(80, '組織名は 80 文字以内で入力してください。'),
});

export async function createOrganization(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = schema.safeParse({
    organizationName: formData.get('organizationName'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: '入力内容をご確認ください。',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect('/login');
  }

  // 組織作成と owner 登録を 1 トランザクションで行うため RPC を経由する。
  const { error } = await supabase.rpc('create_organization', {
    org_name: parsed.data.organizationName,
  });

  if (error !== null) {
    return { ok: false, error: '組織の作成に失敗しました。' };
  }

  revalidatePath('/', 'layout');
  redirect('/stores/new');
}
