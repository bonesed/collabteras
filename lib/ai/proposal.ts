import 'server-only';

import { z } from 'zod';

import { generateJson } from '@/lib/ai/provider';
import {
  COLLAB_TYPE_LABEL_MAP,
  COLLAB_TYPE_PLAYBOOKS,
  PROPOSAL_TONE_GUIDES,
} from '@/lib/constants';
import { formatDistance } from '@/lib/format';
import type { GeneratedProposal, ProposalGenerationInput } from '@/types';

const proposalSchema = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
});

const SYSTEM_PROMPT = `あなたは日本の地域密着型ビジネスに詳しい、店舗間コラボの企画者です。
依頼者の店舗オーナーに代わって、近隣の店舗へ送るコラボのお声がけ文を書きます。

必ず守ること:
- 相手にとっての利点を、依頼者側の利点より先に、具体的に書く。「お互いにメリットがあります」のような
  抽象的な言い方はせず、相手の客層や強みに紐づけて何が増えるのかを書く。
- 依頼者の強みは「相手に差し出せるもの」として書く。自慢や実績の羅列にしない。
- 与えられた情報だけを使う。売上・客数・フォロワー数など、渡されていない数字は書かない。
- 「【店舗名】」のような穴埋め箇所を残さない。実際の店名をそのまま使う。
- 最後は、相手が Yes / No で答えられる小さな一歩（一度お話しする、まず 1 か月試す など）で締める。
- 初回の打診なので、条件を細かく詰めすぎない。

出力は次の形式の JSON オブジェクトのみとします。
{"subject":"...","body":"..."}
subject は件名（Instagram DM のように件名がない経路では、冒頭の一言として使える 30 文字以内の短文）。
body は本文で、改行は \\n で表現してください。署名や差出人名は入れないでください。`;

/** 相手店舗に送るコラボ提案文を 1 通生成する。 */
export async function generateProposal(
  input: ProposalGenerationInput,
): Promise<GeneratedProposal> {
  const { data, model } = await generateJson({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input),
    schema: proposalSchema,
  });

  return { subject: data.subject, body: data.body, model };
}

function buildUserPrompt(input: ProposalGenerationInput): string {
  const { store, candidate, collabType, tone, additionalContext } = input;

  const sections = [
    `# 依頼者の店舗（差出人）
名称: ${store.name}
業種: ${store.category}
紹介: ${store.description ?? '(未入力)'}
来てほしい客層: ${store.target_customer ?? '(未入力)'}
強み: ${store.strengths ?? '(未入力)'}`,

    `# 送り先の店舗（相手）
名称: ${candidate.name}
業種: ${candidate.category ?? '不明'}
所在: ${candidate.address ?? '不明'}${
      candidate.distance_meters === null
        ? ''
        : `（自店舗から ${formatDistance(candidate.distance_meters)}）`
    }`,

    `# この 2 店舗の相性（AI が事前に判定したもの）
スコア: ${candidate.compatibility_score ?? '未算出'} / 100
理由:
${
  candidate.score_reasons.length === 0
    ? '- (未算出)'
    : candidate.score_reasons.map((reason) => `- ${reason}`).join('\n')
}
この理由は、なぜこの組み合わせなのかを説明する材料として本文に自然に織り込んでください。`,

    `# 提案するコラボの内容
種別: ${COLLAB_TYPE_LABEL_MAP[collabType]}
具体的にやること: ${COLLAB_TYPE_PLAYBOOKS[collabType]}
この内容を、上の 2 店舗に合わせて一段具体化したうえで提案してください。`,

    `# 文体と長さ
${PROPOSAL_TONE_GUIDES[tone]}`,
  ];

  if (additionalContext !== undefined && additionalContext.trim() !== '') {
    sections.push(`# オーナーからの補足（最優先で反映する）
${additionalContext.trim()}`);
  }

  return sections.join('\n\n');
}
