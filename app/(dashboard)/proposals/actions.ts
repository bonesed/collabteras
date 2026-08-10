'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { AiProviderError } from '@/lib/ai/provider';
import { generateProposal } from '@/lib/ai/proposal';
import { requireSessionContext } from '@/lib/auth';
import {
  COLLAB_TYPE_VALUES,
  PLANS,
  PROPOSAL_STATUS_VALUES,
  PROPOSAL_TONE_VALUES,
} from '@/lib/constants';
import { toProposalStatusUpdate } from '@/lib/pipeline';
import { getCandidate } from '@/lib/queries/candidates';
import { countProposalsThisMonth } from '@/lib/queries/proposals';
import { getStore } from '@/lib/queries/stores';
import { createClient } from '@/lib/supabase/server';
import type {
  ActionResult,
  GeneratedProposal,
  Json,
  ProposalStatus,
  SavedProposalRef,
} from '@/types';

const generateSchema = z.object({
  candidateId: z.string().uuid(),
  collabType: z.enum(COLLAB_TYPE_VALUES),
  tone: z.enum(PROPOSAL_TONE_VALUES),
  additionalContext: z.string().max(500),
});

const editSchema = z.object({
  proposalId: z.string().uuid(),
  collabType: z.enum(COLLAB_TYPE_VALUES),
  subject: z.string().trim().min(1, '件名を入力してください。').max(120),
  body: z.string().trim().min(1, '本文を入力してください。').max(4000),
  memo: z.string().max(2000).optional(),
});

const statusSchema = z.object({
  proposalId: z.string().uuid(),
  status: z.enum(PROPOSAL_STATUS_VALUES),
});

const saveSchema = generateSchema.extend({
  /** 既存の提案を編集して保存する場合のみ渡す。空なら新しい版として追加する。 */
  proposalId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
  model: z.string().max(100).optional(),
});

/**
 * 相手店舗と自店舗の情報を掛け合わせて、コラボ提案文を 1 通生成する。
 * まだ DB には保存せず、オーナーが編集したうえで `saveProposal` に渡す。
 */
export async function generateProposalDraft(
  _prevState: ActionResult<GeneratedProposal> | null,
  formData: FormData,
): Promise<ActionResult<GeneratedProposal>> {
  const { organization } = await requireSessionContext();

  const parsed = generateSchema.safeParse({
    candidateId: formData.get('candidateId'),
    collabType: formData.get('collabType'),
    tone: formData.get('tone'),
    additionalContext: formData.get('additionalContext') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, error: '生成条件が正しくありません。' };
  }

  const monthlyLimit = PLANS[organization.plan].limits.monthlyProposals;
  if ((await countProposalsThisMonth(organization.id)) >= monthlyLimit) {
    return {
      ok: false,
      error: `今月の提案文の上限（${monthlyLimit} 通）に達しています。プランを変更すると上限が増えます。`,
    };
  }

  const candidate = await getCandidate(organization.id, parsed.data.candidateId);
  if (candidate === null) {
    return { ok: false, error: 'コラボ候補が見つかりませんでした。' };
  }

  const store = await getStore(organization.id, candidate.store_id);
  if (store === null) {
    return { ok: false, error: '自店舗の情報が見つかりませんでした。' };
  }

  try {
    const generated = await generateProposal({
      store,
      candidate,
      collabType: parsed.data.collabType,
      tone: parsed.data.tone,
      additionalContext: parsed.data.additionalContext,
    });

    return { ok: true, data: generated };
  } catch (cause) {
    if (cause instanceof AiProviderError) {
      return { ok: false, error: cause.message };
    }

    console.error('提案文の生成に失敗しました', cause);
    return {
      ok: false,
      error: '提案文の生成に失敗しました。時間をおいて再度お試しください。',
    };
  }
}

/**
 * 編集後の提案文を proposals に保存する。
 * `proposalId` があれば本文の手直しとして上書きし、なければ新しい版として追加して
 * それまでの版をアーカイブする（生成履歴は行として残す）。
 */
export async function saveProposal(
  _prevState: ActionResult<SavedProposalRef> | null,
  formData: FormData,
): Promise<ActionResult<SavedProposalRef>> {
  const { organization, profile } = await requireSessionContext();

  const proposalId = formData.get('proposalId');
  const model = formData.get('model');

  const parsed = saveSchema.safeParse({
    candidateId: formData.get('candidateId'),
    collabType: formData.get('collabType'),
    tone: formData.get('tone'),
    additionalContext: formData.get('additionalContext') ?? '',
    proposalId: proposalId === null || proposalId === '' ? undefined : proposalId,
    subject: formData.get('subject'),
    body: formData.get('body'),
    model: model === null || model === '' ? undefined : model,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: '件名と本文を入力してください。',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const candidate = await getCandidate(organization.id, parsed.data.candidateId);
  if (candidate === null) {
    return { ok: false, error: 'コラボ候補が見つかりませんでした。' };
  }

  const supabase = await createClient();

  if (parsed.data.proposalId !== undefined) {
    const { data, error } = await supabase
      .from('proposals')
      .update({
        collab_type: parsed.data.collabType,
        subject: parsed.data.subject,
        body: parsed.data.body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.proposalId)
      .eq('organization_id', organization.id)
      .select('id, status')
      .maybeSingle();

    if (error !== null) {
      return { ok: false, error: '提案文の保存に失敗しました。' };
    }
    if (data === null) {
      return { ok: false, error: '対象の提案が見つかりませんでした。' };
    }

    revalidatePath('/candidates');
    revalidatePath('/proposals');
    return { ok: true, data };
  }

  // 生成し直した本文は、前の版を残したまま新しい行として積む。
  const { error: archiveError } = await supabase
    .from('proposals')
    .update({ status: 'archived' })
    .eq('organization_id', organization.id)
    .eq('candidate_id', candidate.id)
    .neq('status', 'archived');

  if (archiveError !== null) {
    return { ok: false, error: '提案文の保存に失敗しました。' };
  }

  const generationParams: Json = {
    tone: parsed.data.tone,
    collabType: parsed.data.collabType,
    additionalContext: parsed.data.additionalContext,
  };

  const { data, error } = await supabase
    .from('proposals')
    .insert({
      organization_id: organization.id,
      store_id: candidate.store_id,
      candidate_id: candidate.id,
      collab_type: parsed.data.collabType,
      status: 'ready',
      subject: parsed.data.subject,
      body: parsed.data.body,
      model: parsed.data.model ?? null,
      generation_params: generationParams,
      created_by: profile.id,
    })
    .select('id, status')
    .single();

  if (error !== null) {
    return { ok: false, error: '提案文の保存に失敗しました。' };
  }

  // 提案文を書いた時点で、この候補はアプローチ対象として扱う。
  await supabase
    .from('candidates')
    .update({ is_saved: true, is_dismissed: false })
    .eq('id', candidate.id)
    .eq('organization_id', organization.id);

  revalidatePath('/candidates');
  revalidatePath('/proposals');
  return { ok: true, data };
}

/**
 * 詳細画面での手直し。件名・本文・コラボ種別・メモだけを上書きし、
 * ステータスと生成条件には触れない。
 */
export async function updateProposal(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const { organization } = await requireSessionContext();

  const parsed = editSchema.safeParse({
    proposalId: formData.get('proposalId'),
    collabType: formData.get('collabType'),
    subject: formData.get('subject'),
    body: formData.get('body'),
    memo: formData.get('memo') ?? '',
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: '入力内容をご確認ください。',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const memo = parsed.data.memo?.trim() ?? '';

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proposals')
    .update({
      collab_type: parsed.data.collabType,
      subject: parsed.data.subject,
      body: parsed.data.body,
      memo: memo === '' ? null : memo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.proposalId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle();

  if (error !== null) {
    return { ok: false, error: '提案の保存に失敗しました。' };
  }
  if (data === null) {
    return { ok: false, error: '対象の提案が見つかりませんでした。' };
  }

  revalidatePath('/candidates');
  revalidatePath('/proposals');
  revalidatePath(`/proposals/${parsed.data.proposalId}`);
  return { ok: true, data: null };
}

/**
 * 詳細画面からのステータス変更。カンバンは候補の `is_dismissed` と
 * 提案のステータスの両方から列を決めるため、ここでも両方をそろえる。
 */
export async function updateProposalStatus(
  proposalId: string,
  status: ProposalStatus,
): Promise<ActionResult<null>> {
  const { organization } = await requireSessionContext();

  const parsed = statusSchema.safeParse({ proposalId, status });
  if (!parsed.success) {
    return { ok: false, error: '不正な操作です。' };
  }

  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from('proposals')
    .select('id, candidate_id, sent_at, replied_at')
    .eq('id', parsed.data.proposalId)
    .eq('organization_id', organization.id)
    .maybeSingle();

  if (fetchError !== null) {
    return { ok: false, error: 'ステータスの更新に失敗しました。' };
  }
  if (current === null) {
    return { ok: false, error: '対象の提案が見つかりませんでした。' };
  }

  const { error: updateError } = await supabase
    .from('proposals')
    .update(toProposalStatusUpdate(parsed.data.status, current))
    .eq('id', current.id)
    .eq('organization_id', organization.id);

  if (updateError !== null) {
    return { ok: false, error: 'ステータスの更新に失敗しました。' };
  }

  await supabase
    .from('candidates')
    .update({ is_dismissed: parsed.data.status === 'declined' })
    .eq('id', current.candidate_id)
    .eq('organization_id', organization.id);

  revalidatePath('/candidates');
  revalidatePath('/proposals');
  revalidatePath(`/proposals/${current.id}`);
  return { ok: true, data: null };
}

/** 提案を削除する。候補そのものは残すので、同じ相手に書き直せる。 */
export async function deleteProposal(
  proposalId: string,
): Promise<ActionResult<null>> {
  const { organization } = await requireSessionContext();

  const parsed = z.string().uuid().safeParse(proposalId);
  if (!parsed.success) {
    return { ok: false, error: '不正な操作です。' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proposals')
    .delete()
    .eq('id', parsed.data)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle();

  if (error !== null) {
    return { ok: false, error: '提案の削除に失敗しました。' };
  }
  if (data === null) {
    return { ok: false, error: '対象の提案が見つかりませんでした。' };
  }

  revalidatePath('/candidates');
  revalidatePath('/proposals');
  return { ok: true, data: null };
}
