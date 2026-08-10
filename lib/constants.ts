import type {
  CollabType,
  CollabTypeLabel,
  JobStatusLabel,
  PipelineStage,
  PipelineStageLabel,
  PlanDefinition,
  PlanTier,
  ProposalStatusLabel,
  ProposalTone,
  LabelDefinition,
} from '@/types';

export const APP_NAME = 'CollabTeras';
export const APP_TAGLINE = '近隣店舗とのコラボを、AI が見つけて言葉にする。';

export const COLLAB_TYPE_LABELS: readonly CollabTypeLabel[] = [
  { value: 'joint_event', label: '共同イベント' },
  { value: 'mutual_referral', label: '相互送客' },
  { value: 'bundle_product', label: 'コラボ商品・セット販売' },
  { value: 'sns_campaign', label: 'SNS 共同企画' },
  { value: 'coupon_exchange', label: 'クーポン相互設置' },
  { value: 'other', label: 'その他' },
] as const;

/**
 * コラボ種別ごとの「実際に何をするか」。提案文生成のプロンプトと、
 * 種別を選ぶ UI の補足説明の両方で使う。
 */
export const COLLAB_TYPE_PLAYBOOKS: Readonly<Record<CollabType, string>> = {
  coupon_exchange:
    'お互いの店内にチラシやクーポンを置き、持参したお客様に特典を出し合う',
  sns_campaign:
    'Instagram の投稿やストーリーズでお互いの店を紹介し合い、相互にタグ付けする',
  mutual_referral:
    '会員・常連のお客様だけが使える限定特典を用意し、お互いの店に送客する',
  joint_event: '共同でイベントやワークショップを開催し、両店のお客様を集める',
  bundle_product: '両店の商品を組み合わせたセットや期間限定メニューを販売する',
  other: '上記に当てはまらない、この 2 店舗ならではの組み合わせを考える',
} as const;

export const PROPOSAL_STATUS_LABELS: readonly ProposalStatusLabel[] = [
  { value: 'draft', label: '下書き' },
  { value: 'ready', label: '送付準備完了' },
  { value: 'sent', label: '送付済み' },
  { value: 'replied', label: '返信あり' },
  { value: 'agreed', label: '成立' },
  { value: 'declined', label: '見送り' },
  { value: 'archived', label: 'アーカイブ' },
] as const;

export const JOB_STATUS_LABELS: readonly JobStatusLabel[] = [
  { value: 'queued', label: '待機中' },
  { value: 'running', label: '抽出中' },
  { value: 'succeeded', label: '完了' },
  { value: 'failed', label: '失敗' },
] as const;

/** トーンは「どの経路で送るか」とセットで選ぶ。ラベルに送付先を含めている。 */
export const PROPOSAL_TONE_LABELS: readonly LabelDefinition<ProposalTone>[] = [
  { value: 'friendly', label: 'フランク（Instagram DM 向け）' },
  { value: 'polite', label: 'フォーマル（Web フォーム・メール向け）' },
  { value: 'concise', label: '簡潔（要点だけを短く）' },
] as const;

/** トーンごとに AI へ渡す書き分けの指示 */
export const PROPOSAL_TONE_GUIDES: Readonly<Record<ProposalTone, string>> = {
  friendly: `Instagram の DM で送る前提。敬語は保ちつつ、堅すぎない話し言葉に近い文体にする。
挨拶は 1 行で切り上げ、改行を多めに入れてスマホで読みやすくする。全体で 250 文字前後。
「〜させていただきたく存じます」のような硬い言い回しは使わない。`,
  polite: `Web の問い合わせフォームやメールで送る前提。初対面の事業者に送るビジネス文書として整える。
名乗り・きっかけ・提案内容・お願いしたいことの順に段落を分ける。全体で 400〜600 文字。`,
  concise: `忙しい店主が 15 秒で読み切れる長さにする。前置きを省き、提案内容と次のアクションだけを書く。
全体で 150 文字前後。箇条書きを 1 箇所だけ使ってよい。`,
};

export const PIPELINE_STAGE_LABELS: readonly PipelineStageLabel[] = [
  { value: 'not_started', label: '未アプローチ' },
  { value: 'drafted', label: '提案文作成済み' },
  { value: 'sent', label: '送信済み' },
  { value: 'replied', label: '返信あり（交渉中）' },
  { value: 'agreed', label: '提携成立' },
  { value: 'declined', label: '見送り' },
] as const;

/** 近隣抽出の検索半径の選択肢（メートル） */
export const SEARCH_RADIUS_OPTIONS = [300, 500, 800, 1200, 2000] as const;

/**
 * 抽出対象にできる業種。値は Places API (New) の `includedTypes` に渡す type。
 * 未選択のときは全業種を対象にする。
 */
export const PLACE_CATEGORY_OPTIONS: readonly LabelDefinition<string>[] = [
  { value: 'cafe', label: 'カフェ' },
  { value: 'restaurant', label: '飲食店' },
  { value: 'bakery', label: 'ベーカリー' },
  { value: 'bar', label: 'バー' },
  { value: 'beauty_salon', label: 'エステ・サロン' },
  { value: 'hair_care', label: '美容室・理容室' },
  { value: 'spa', label: 'スパ・整体' },
  { value: 'gym', label: 'ジム・スタジオ' },
  { value: 'book_store', label: '書店' },
  { value: 'clothing_store', label: 'アパレル' },
  { value: 'florist', label: '花屋' },
  { value: 'art_gallery', label: 'ギャラリー' },
  { value: 'pet_store', label: 'ペットショップ' },
  { value: 'store', label: 'その他小売' },
] as const;

/** 1 回の抽出で取得する候補の上限。Places API の 1 リクエスト上限に合わせている。 */
export const MAX_CANDIDATES_PER_SEARCH = 20;

export const PLANS: Readonly<Record<PlanTier, PlanDefinition>> = {
  free: {
    tier: 'free',
    name: 'フリー',
    description: 'まずは 1 店舗で、コラボ候補の見え方を試したい方に。',
    monthlyPriceJpy: 0,
    limits: {
      maxStores: 1,
      monthlySearches: 20,
      monthlyProposals: 5,
      maxMembers: 1,
    },
    features: ['店舗登録 1 件', '検索 月 20 件', '提案文生成 月 5 通'],
  },
  light: {
    tier: 'light',
    name: 'ライト',
    description: '単独店舗で継続的にコラボ先を開拓する店舗オーナー向け。',
    monthlyPriceJpy: 9800,
    limits: {
      maxStores: 1,
      monthlySearches: 100,
      monthlyProposals: 30,
      maxMembers: 3,
    },
    features: [
      '検索 月 100 件',
      '提案文生成 月 30 通',
      'カンバン管理 無制限',
      'チームメンバー 3 人',
    ],
  },
  standard: {
    tier: 'standard',
    name: 'スタンダード',
    description: 'コラボ施策を主要な集客チャネルとして回したい店舗向け。',
    monthlyPriceJpy: 19800,
    limits: {
      maxStores: 1,
      monthlySearches: 300,
      monthlyProposals: 100,
      maxMembers: 5,
    },
    features: [
      '検索 月 300 件',
      '提案文生成 月 100 通',
      'カンバン管理 無制限',
      'A/B テスト提案文',
      '優先サポート',
    ],
  },
  pro: {
    tier: 'pro',
    name: 'プロ',
    description: '複数店舗・チーム運用でコラボ施策を回す事業者向け。',
    monthlyPriceJpy: 39800,
    limits: {
      maxStores: 5,
      monthlySearches: 1000,
      monthlyProposals: 300,
      maxMembers: 20,
    },
    features: [
      '多店舗管理 5 店舗まで',
      '検索 月 1,000 件',
      '提案文生成 月 300 通',
      'A/B テスト提案文・優先サポート',
      'CSV 一括出力',
    ],
  },
} as const;

function toLabelMap<T extends string>(
  labels: readonly LabelDefinition<T>[],
): Readonly<Record<T, string>> {
  return Object.fromEntries(
    labels.map((item) => [item.value, item.label]),
  ) as Record<T, string>;
}

export const COLLAB_TYPE_LABEL_MAP = toLabelMap(COLLAB_TYPE_LABELS);
export const PROPOSAL_STATUS_LABEL_MAP = toLabelMap(PROPOSAL_STATUS_LABELS);
export const JOB_STATUS_LABEL_MAP = toLabelMap(JOB_STATUS_LABELS);
export const PROPOSAL_TONE_LABEL_MAP = toLabelMap(PROPOSAL_TONE_LABELS);
export const PIPELINE_STAGE_LABEL_MAP = toLabelMap(PIPELINE_STAGE_LABELS);

function toValues<T extends string>(
  labels: readonly LabelDefinition<T>[],
): [T, ...T[]] {
  return labels.map((item) => item.value) as [T, ...T[]];
}

// z.enum() に渡すための、1 要素以上が保証された値のタプル。
export const COLLAB_TYPE_VALUES = toValues(COLLAB_TYPE_LABELS);
export const PROPOSAL_STATUS_VALUES = toValues(PROPOSAL_STATUS_LABELS);
export const PROPOSAL_TONE_VALUES = toValues(PROPOSAL_TONE_LABELS);
export const PIPELINE_STAGE_VALUES = toValues(PIPELINE_STAGE_LABELS);
