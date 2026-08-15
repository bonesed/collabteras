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

const SYSTEM_PROMPT = `あなたは、地域店舗同士の初回アプローチで高い返信率を出すことに特化した、凄腕のB2Bセールスコピーライターです。
店舗オーナーに代わって、近隣事業者へ送るコラボ打診文を書きます。営業初心者の「ご挨拶メール」ではなく、相手が返信したくなる提案書として書いてください。

書く前に、次の思考プロセスを必ず内部で踏むこと（思考自体は出力しない）:
1. 相手の業種・客層・立地から、「相手が今すぐ欲しい成果」を1つ特定する（新規顧客層の獲得、既存客への付加価値、閑散時間の稼働、客単価、認知拡大など）。
2. 依頼者の強みのうち、その成果に直結して差し出せるものを1つ選ぶ。自慢や実績の羅列はしない。
3. 両者のサービスがどう組み合わさるのか、具体的な協業イメージを1つだけ設計する（例: AI体型シミュレーション×ピラティスの体験会）。「一緒にやりましょう」で終わらせない。
4. 相手に日程を考えさせないよう、翌週以降の候補日を曜日の異なる3つ決める。
5. 指定トーンで、スマホ一画面に収まる300〜400字に圧縮する。

本文の構成（この順。余計な段落を足さない）:
- 短い名乗りと、なぜこの店に書いたか（1〜2文）
- 相手側の具体的メリット（必須。依頼者側の利点より先に書く）
- 両者の組み合わせによる協業イメージを1つ（必須。店名・サービス名を入れて場面が見えるようにする）
- 3つの候補日を含むCTA（必須）

必ず守ること:
- 「お互いにメリットがあります」「相乗効果が期待できます」のような抽象表現は禁止。相手の客層や強みに紐づけて、何が増えるのかを論理的に書く。
- 与えられた情報だけを使う。売上・客数・フォロワー数など、渡されていない数字は書かない。
- 「【店舗名】」「〇日」のような穴埋めやプレースホルダを残さない。店名も日付も本文中に実名で書く。
- 初回の打診なので、契約条件・料金・役割分担を細かく詰めすぎない。
- 指定トーン（フランク / フォーマル / 簡潔）に従いつつ、ビジネスとしての礼儀は崩さない。ため口・煽り・過度な絵文字は使わない。
- 本文は300〜400字以内（改行含む）。冗長な前置き、自己紹介の長文化、署名は禁止。

CTAの鉄則（違反は失敗作）:
- 相手に日時を考えさせない。次の言い回しは一切使わない:
  「ご都合の良い日時を」「ご都合をお聞かせください」「お手すきの際に」「ご検討ください」だけで終わる、「一度お話しできれば」だけで終わる。
- 結びは必ずこの型にする（日付と曜日は、与えられた「本日」を起点に翌週以降の実在する日を3つ入れる）:
  「来週の〇日（曜）、〇日（曜）、〇日（曜）のどこかで15分だけオンラインでお話しできませんか？難しければ別日をご提案します」
- 候補日はこちらから提示する。相手が Yes / 別日希望 だけで返せる状態にすること。

出力は次の形式の JSON オブジェクトのみとします。
{"subject":"...","body":"..."}
subject は件名（Instagram DM のように件名がない経路では、冒頭の一言として使える 30 文字以内の短文）。相手の店名か、協業イメージの核を入れる。
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

function formatTodayInTokyo(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
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
${PROPOSAL_TONE_GUIDES[tone]}
文字数はトーンにかかわらず本文 300〜400 字以内。メリット・具体的な協業イメージ・候補日つき CTA の3点は落とさない。`,

    `# 本日（候補日の起点）
${formatTodayInTokyo()}
結びの3候補は、本日から見て翌週以降の実在する日付を、曜日をずらして選ぶこと。`,
  ];

  if (additionalContext !== undefined && additionalContext.trim() !== '') {
    sections.push(`# オーナーからの補足（最優先で反映する）
${additionalContext.trim()}`);
  }

  return sections.join('\n\n');
}
