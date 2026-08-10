import 'server-only';

import { z } from 'zod';

import { generateJson } from '@/lib/ai/provider';
import { COLLAB_TYPE_LABELS, COLLAB_TYPE_VALUES } from '@/lib/constants';
import type { CompatibilityAssessment, PlaceSummary, Store } from '@/types';

/** 1 リクエストに詰める候補数。多すぎると精度と応答速度が落ちる。 */
const BATCH_SIZE = 10;

const assessmentSchema = z.object({
  assessments: z.array(
    z.object({
      placeId: z.string(),
      score: z.number().int().min(0).max(100),
      reasons: z.array(z.string()).min(1).max(3),
      collabTypes: z.array(z.enum(COLLAB_TYPE_VALUES)).max(3),
    }),
  ),
});

const SYSTEM_PROMPT = `あなたは日本の地域密着型ビジネスに詳しいコラボレーション企画のコンサルタントです。
依頼者の店舗と、その近隣にある店舗の組み合わせについて、共同企画が成立する見込みを評価します。

評価の観点:
- 客層の重なり（同じ人が両方を利用しうるか）
- 競合ではなく補完の関係にあるか（直接競合は低評価）
- 利用シーンのつながり（食事の前後、買い物のついでなど）
- 距離の近さと、実際に送客が起こりやすいか

score は 0-100 の整数で、80 以上は「すぐ提案すべき」、40 未満は「無理に組む必要はない」を意味します。
reasons は依頼者の店舗オーナーが読んで納得できる、その 2 店舗に固有の具体的な日本語の短文にしてください。
一般論（「近いので送客しやすい」など、どの組み合わせにも当てはまる文）は避けてください。

出力は次の形式の JSON オブジェクトのみとし、入力に含まれるすべての placeId を漏れなく含めてください。
{"assessments":[{"placeId":"...","score":0,"reasons":["..."],"collabTypes":["..."]}]}`;

interface StoreProfile
  extends Pick<
    Store,
    'name' | 'category' | 'description' | 'target_customer' | 'strengths'
  > {}

/**
 * 近隣店舗ごとの相性スコアを AI で算出する。
 * AI が返さなかった店舗はスコア未算出（結果に含まれない）として扱う。
 */
export async function assessCompatibility(
  store: StoreProfile,
  places: PlaceSummary[],
): Promise<CompatibilityAssessment[]> {
  if (places.length === 0) {
    return [];
  }

  const batches: PlaceSummary[][] = [];
  for (let index = 0; index < places.length; index += BATCH_SIZE) {
    batches.push(places.slice(index, index + BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) => assessBatch(store, batch)),
  );

  return results.flat();
}

async function assessBatch(
  store: StoreProfile,
  places: PlaceSummary[],
): Promise<CompatibilityAssessment[]> {
  const collabTypeGuide = COLLAB_TYPE_LABELS.map(
    (item) => `- ${item.value}: ${item.label}`,
  ).join('\n');

  const userPrompt = `# 依頼者の店舗
名称: ${store.name}
業種: ${store.category}
紹介: ${store.description ?? '(未入力)'}
来てほしい客層: ${store.target_customer ?? '(未入力)'}
強み: ${store.strengths ?? '(未入力)'}

# 近隣店舗（この ${places.length} 件すべてを評価する）
${places.map(describePlace).join('\n')}

# collabTypes に使える値
${collabTypeGuide}`;

  const { data } = await generateJson({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    schema: assessmentSchema,
  });

  return data.assessments.map((assessment) => ({
    placeId: assessment.placeId,
    score: assessment.score,
    reasons: assessment.reasons,
    suggestedCollabTypes: assessment.collabTypes,
  }));
}

function describePlace(place: PlaceSummary): string {
  const parts = [
    `placeId: ${place.placeId}`,
    `名称: ${place.name}`,
    `業種: ${place.category ?? '不明'}`,
  ];

  if (place.rating !== null) {
    parts.push(`評価: ${place.rating}（${place.userRatingsTotal ?? 0} 件）`);
  }
  if (place.priceLevel !== null) {
    parts.push(`価格帯: ${place.priceLevel}/4`);
  }
  if (place.address !== null) {
    parts.push(`住所: ${place.address}`);
  }

  return `- ${parts.join(' / ')}`;
}
