'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assessCompatibility } from '@/lib/ai/compatibility';
import { requireSessionContext } from '@/lib/auth';
import {
  MAX_CANDIDATES_PER_SEARCH,
  PIPELINE_STAGE_LABEL_MAP,
  PIPELINE_STAGE_VALUES,
  PLANS,
} from '@/lib/constants';
import {
  geocodeAddress,
  haversineDistanceMeters,
  searchNearbyPlaces,
  type Coordinates,
} from '@/lib/google/places';
import {
  STAGE_TO_PROPOSAL_STATUS,
  STAGES_REQUIRING_PROPOSAL,
  toProposalStatusUpdate,
} from '@/lib/pipeline';
import { getActiveProposalForCandidate } from '@/lib/queries/proposals';
import { countSearchJobsThisMonth } from '@/lib/queries/search-jobs';
import { getStore } from '@/lib/queries/stores';
import { createClient } from '@/lib/supabase/server';
import type {
  ActionResult,
  CompatibilityAssessment,
  PipelineStage,
  PlaceSummary,
  Store,
  TablesInsert,
} from '@/types';

const searchSchema = z.object({
  storeId: z.string().uuid(),
  radiusMeters: z.coerce.number().int().min(100).max(5000),
  categories: z.array(z.string().min(1)).max(20),
});

const stageSchema = z.object({
  candidateId: z.string().uuid(),
  stage: z.enum(PIPELINE_STAGE_VALUES),
});

export async function runNearbySearch(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const { organization } = await requireSessionContext();

  const parsed = searchSchema.safeParse({
    storeId: formData.get('storeId'),
    radiusMeters: formData.get('radiusMeters'),
    categories: formData.getAll('categories'),
  });

  if (!parsed.success) {
    return { ok: false, error: '検索条件が正しくありません。' };
  }

  const monthlyLimit = PLANS[organization.plan].limits.monthlySearches;
  if ((await countSearchJobsThisMonth(organization.id)) >= monthlyLimit) {
    return {
      ok: false,
      error: `今月の抽出回数の上限（${monthlyLimit} 回）に達しています。プランを変更すると上限が増えます。`,
    };
  }

  const store = await getStore(organization.id, parsed.data.storeId);
  if (store === null) {
    return { ok: false, error: '店舗が見つかりませんでした。' };
  }

  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from('search_jobs')
    .insert({
      organization_id: organization.id,
      store_id: store.id,
      status: 'running',
      radius_meters: parsed.data.radiusMeters,
      categories: parsed.data.categories,
    })
    .select()
    .single();

  if (jobError !== null) {
    return { ok: false, error: '抽出ジョブの作成に失敗しました。' };
  }

  try {
    const origin = await resolveStoreCoordinates(store);

    if (origin === null) {
      throw new Error(
        '店舗の住所から位置を特定できませんでした。住所を見直してください。',
      );
    }

    const places = (
      await searchNearbyPlaces({
        latitude: origin.latitude,
        longitude: origin.longitude,
        radiusMeters: parsed.data.radiusMeters,
        categories: parsed.data.categories,
        limit: MAX_CANDIDATES_PER_SEARCH,
      })
    ).filter((place) => place.placeId !== store.google_place_id);

    const assessments = await assessCompatibility(store, places);
    const rows = places.map((place) =>
      toCandidateRow(organization.id, store.id, origin, place, assessments),
    );

    if (rows.length > 0) {
      // 同じ店舗が再抽出で重複しないよう place_id で上書きする。
      const { error: upsertError } = await supabase
        .from('candidates')
        .upsert(rows, { onConflict: 'store_id,google_place_id' });

      if (upsertError !== null) {
        throw new Error(`候補の保存に失敗しました: ${upsertError.message}`);
      }
    }

    await supabase
      .from('search_jobs')
      .update({
        status: 'succeeded',
        found_count: rows.length,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : '不明なエラーが発生しました。';

    await supabase
      .from('search_jobs')
      .update({
        status: 'failed',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return { ok: false, error: `抽出に失敗しました: ${message}` };
  }

  revalidatePath('/candidates');
  redirect(`/candidates?store=${store.id}`);
}

/**
 * カンバンでカードを移動したときに、候補と最新の提案の状態をそろえる。
 * ドラッグ＆ドロップとステータス選択の両方から呼ぶため、FormData ではなく
 * 直接引数を受け取る。
 */
export async function updateCandidateStage(
  candidateId: string,
  stage: PipelineStage,
): Promise<ActionResult<null>> {
  const { organization } = await requireSessionContext();

  const parsed = stageSchema.safeParse({ candidateId, stage });
  if (!parsed.success) {
    return { ok: false, error: '不正な操作です。' };
  }

  const proposal = await getActiveProposalForCandidate(
    organization.id,
    parsed.data.candidateId,
  );

  if (proposal === null && STAGES_REQUIRING_PROPOSAL.includes(parsed.data.stage)) {
    return {
      ok: false,
      error: `「${PIPELINE_STAGE_LABEL_MAP[parsed.data.stage]}」に移すには、先に提案文を作成してください。`,
    };
  }

  const supabase = await createClient();

  const { data: updated, error: candidateError } = await supabase
    .from('candidates')
    .update({ is_dismissed: parsed.data.stage === 'declined' })
    .eq('id', parsed.data.candidateId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle();

  if (candidateError !== null) {
    return { ok: false, error: 'ステータスの更新に失敗しました。' };
  }
  if (updated === null) {
    return { ok: false, error: 'コラボ候補が見つかりませんでした。' };
  }

  if (proposal !== null) {
    const { error: proposalError } = await supabase
      .from('proposals')
      .update(
        toProposalStatusUpdate(
          STAGE_TO_PROPOSAL_STATUS[parsed.data.stage],
          proposal,
        ),
      )
      .eq('id', proposal.id)
      .eq('organization_id', organization.id);

    if (proposalError !== null) {
      return { ok: false, error: 'ステータスの更新に失敗しました。' };
    }
  }

  revalidatePath('/candidates');
  revalidatePath('/proposals');
  return { ok: true, data: null };
}

/**
 * 店舗の座標を返す。未登録なら住所からジオコーディングし、次回のために保存する。
 */
async function resolveStoreCoordinates(store: Store): Promise<Coordinates | null> {
  if (store.latitude !== null && store.longitude !== null) {
    return { latitude: store.latitude, longitude: store.longitude };
  }

  if (store.address === null) {
    return null;
  }

  const coordinates = await geocodeAddress(store.address);
  if (coordinates === null) {
    return null;
  }

  const supabase = await createClient();
  await supabase
    .from('stores')
    .update({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    })
    .eq('id', store.id);

  return coordinates;
}

function toCandidateRow(
  organizationId: string,
  storeId: string,
  origin: Coordinates,
  place: PlaceSummary,
  assessments: CompatibilityAssessment[],
): TablesInsert<'candidates'> {
  const assessment = assessments.find(
    (item) => item.placeId === place.placeId,
  );

  const distance =
    place.latitude === null || place.longitude === null
      ? null
      : haversineDistanceMeters(origin, {
          latitude: place.latitude,
          longitude: place.longitude,
        });

  return {
    organization_id: organizationId,
    store_id: storeId,
    google_place_id: place.placeId,
    name: place.name,
    category: place.category,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    distance_meters: distance,
    rating: place.rating,
    user_ratings_total: place.userRatingsTotal,
    price_level: place.priceLevel,
    website: place.website,
    phone: place.phone,
    photo_url: place.photoUrl,
    compatibility_score: assessment?.score ?? null,
    score_reasons: assessment?.reasons ?? [],
    suggested_collab_types: assessment?.suggestedCollabTypes ?? [],
  };
}
