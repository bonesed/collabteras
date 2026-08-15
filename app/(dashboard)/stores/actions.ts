'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireSessionContext } from '@/lib/auth';
import { geocodeAddress, type Coordinates } from '@/lib/google/places';
import { getOrganizationPlan } from '@/lib/queries/organizations';
import { getStore } from '@/lib/queries/stores';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

const storeSchema = z.object({
  name: z.string().min(1, '店舗名を入力してください。').max(100),
  category: z.string().min(1, '業種を入力してください。').max(50),
  address: z.string().max(200).optional(),
  website: z.string().url('URL の形式が正しくありません。').or(z.literal('')).optional(),
  description: z.string().max(1000).optional(),
  targetCustomer: z.string().max(500).optional(),
  strengths: z.string().max(500).optional(),
});

const updateSchema = storeSchema.extend({ storeId: z.string().uuid() });

/** FormData から store のフィールドを読み出す。作成と更新で同じ入力欄を使う。 */
function readStoreFields(formData: FormData) {
  return {
    name: formData.get('name'),
    category: formData.get('category'),
    address: formData.get('address'),
    website: formData.get('website'),
    description: formData.get('description'),
    targetCustomer: formData.get('targetCustomer'),
    strengths: formData.get('strengths'),
  };
}

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  return value.trim();
}

export async function createStore(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const { organization } = await requireSessionContext();
  const { organization: latestOrganization, limits } = await getOrganizationPlan(
    organization.id,
  );

  const parsed = storeSchema.safeParse(readStoreFields(formData));

  if (!parsed.success) {
    return {
      ok: false,
      error: '入力内容をご確認ください。',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from('stores')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', latestOrganization.id);

  if (countError !== null) {
    return { ok: false, error: '店舗数の確認に失敗しました。' };
  }

  const limit = limits.maxStores;
  if ((count ?? 0) >= limit) {
    return {
      ok: false,
      error: `現在のプランで登録できる店舗数の上限（${limit} 件）に達しています。`,
    };
  }

  const address = emptyToNull(parsed.data.address);
  const coordinates = await tryGeocode(address);

  const { error } = await supabase.from('stores').insert({
    organization_id: latestOrganization.id,
    name: parsed.data.name,
    category: parsed.data.category,
    address,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    website: emptyToNull(parsed.data.website),
    description: emptyToNull(parsed.data.description),
    target_customer: emptyToNull(parsed.data.targetCustomer),
    strengths: emptyToNull(parsed.data.strengths),
  });

  if (error !== null) {
    return { ok: false, error: '店舗の登録に失敗しました。' };
  }

  revalidatePath('/stores');
  redirect('/stores');
}

export async function updateStore(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const { organization } = await requireSessionContext();

  const parsed = updateSchema.safeParse({
    ...readStoreFields(formData),
    storeId: formData.get('storeId'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: '入力内容をご確認ください。',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const current = await getStore(organization.id, parsed.data.storeId);
  if (current === null) {
    return { ok: false, error: '店舗が見つかりませんでした。' };
  }

  // 住所が変わったときだけ座標を引き直す。変わっていなければ既存の値を使う。
  const address = emptyToNull(parsed.data.address);
  let latitude = current.latitude;
  let longitude = current.longitude;

  if (address !== current.address) {
    const coordinates = await tryGeocode(address);
    latitude = coordinates?.latitude ?? null;
    longitude = coordinates?.longitude ?? null;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('stores')
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      address,
      latitude,
      longitude,
      website: emptyToNull(parsed.data.website),
      description: emptyToNull(parsed.data.description),
      target_customer: emptyToNull(parsed.data.targetCustomer),
      strengths: emptyToNull(parsed.data.strengths),
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id)
    .eq('organization_id', organization.id);

  if (error !== null) {
    return { ok: false, error: '店舗の更新に失敗しました。' };
  }

  revalidatePath('/stores');
  revalidatePath(`/stores/${current.id}`);
  revalidatePath('/candidates');
  return { ok: true, data: null };
}

/**
 * 店舗を削除する。外部キーの cascade により、その店舗の候補・提案・抽出履歴も
 * まとめて消える。呼び出し側で必ず確認を取ること。
 */
export async function deleteStore(storeId: string): Promise<ActionResult<null>> {
  const { organization } = await requireSessionContext();

  const parsed = z.string().uuid().safeParse(storeId);
  if (!parsed.success) {
    return { ok: false, error: '不正な操作です。' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stores')
    .delete()
    .eq('id', parsed.data)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle();

  if (error !== null) {
    return { ok: false, error: '店舗の削除に失敗しました。' };
  }
  if (data === null) {
    return { ok: false, error: '店舗が見つかりませんでした。' };
  }

  revalidatePath('/stores');
  revalidatePath('/candidates');
  revalidatePath('/proposals');
  revalidatePath('/dashboard');
  return { ok: true, data: null };
}

/**
 * 住所から座標を求める。ここでの失敗は登録自体を止めるほどではないため、
 * 座標なしで登録し、抽出を実行するときに改めて解決する。
 */
async function tryGeocode(address: string | null): Promise<Coordinates | null> {
  if (address === null) {
    return null;
  }

  try {
    return await geocodeAddress(address);
  } catch (cause) {
    console.error('店舗住所のジオコーディングに失敗しました', cause);
    return null;
  }
}
