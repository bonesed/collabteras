/**
 * アプリ全体で共有するドメイン型。
 * DB 行そのものは `types/database.ts` の `Tables<'...'>` を使い、ここでは
 * 画面/ロジック側で扱う派生型・値オブジェクト・入出力契約を定義する。
 */

import type {
  CollabType,
  JobStatus,
  MemberRole,
  PlanTier,
  ProposalStatus,
  Tables,
} from '@/types/database';

export type {
  CollabType,
  JobStatus,
  Json,
  MemberRole,
  PlanTier,
  ProposalStatus,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/types/database';

export type Profile = Tables<'profiles'>;
export type Organization = Tables<'organizations'>;
export type OrganizationMember = Tables<'organization_members'>;
export type Store = Tables<'stores'>;
export type Candidate = Tables<'candidates'>;
export type Proposal = Tables<'proposals'>;
export type SearchJob = Tables<'search_jobs'>;

/** サイドバーやヘッダーで使う、ログインユーザーと所属組織のまとまり */
export interface SessionContext {
  profile: Profile;
  organization: Organization;
  role: MemberRole;
}

/** 候補一覧に提案の有無を添えた表示用の型 */
export interface CandidateWithProposals extends Candidate {
  proposals: Pick<
    Proposal,
    'id' | 'status' | 'collab_type' | 'subject' | 'body' | 'model' | 'updated_at'
  >[];
}

/** カンバンの列。候補の `is_dismissed` と最新の提案のステータスから導出する */
export type PipelineStage =
  | 'not_started'
  | 'drafted'
  | 'sent'
  | 'replied'
  | 'agreed'
  | 'declined';

/** 提案一覧で相手店舗名を併記するための表示用の型 */
export interface ProposalWithCandidate extends Proposal {
  candidate: Pick<Candidate, 'id' | 'name' | 'category' | 'photo_url'>;
}

/** 提案の詳細画面で扱う、相手店舗と発信元店舗を添えた提案 */
export interface ProposalDetail extends Proposal {
  candidate: Candidate;
  store: Pick<Store, 'id' | 'name' | 'category'>;
}

// ---------------------------------------------------------------------------
// Server Actions の戻り値
// ---------------------------------------------------------------------------

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

// ---------------------------------------------------------------------------
// 外部連携（Google Places / AI）
// ---------------------------------------------------------------------------

/** Google Places API のレスポンスから、アプリで使う項目だけを正規化したもの */
export interface PlaceSummary {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  userRatingsTotal: number | null;
  priceLevel: number | null;
  website: string | null;
  phone: string | null;
  photoUrl: string | null;
}

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  /** Google Places の type。空なら全業種を対象にする */
  categories: string[];
  limit: number;
}

/** AI による相性判定の結果 */
export interface CompatibilityAssessment {
  placeId: string;
  score: number;
  reasons: string[];
  suggestedCollabTypes: CollabType[];
}

/** 提案文生成の入力条件 */
export interface ProposalGenerationInput {
  store: Pick<
    Store,
    'name' | 'category' | 'description' | 'target_customer' | 'strengths'
  >;
  candidate: Pick<
    Candidate,
    | 'name'
    | 'category'
    | 'address'
    | 'distance_meters'
    | 'compatibility_score'
    | 'score_reasons'
  >;
  collabType: CollabType;
  tone: ProposalTone;
  /** オーナーが追記したい要望（例: 「初回は小さく試したい」） */
  additionalContext?: string;
}

export type ProposalTone = 'polite' | 'friendly' | 'concise';

export interface GeneratedProposal {
  subject: string;
  body: string;
  model: string;
}

/** 提案文を保存した直後にクライアントへ返す最小限の情報 */
export interface SavedProposalRef {
  id: string;
  status: ProposalStatus;
}

// ---------------------------------------------------------------------------
// プラン
// ---------------------------------------------------------------------------

export interface PlanLimits {
  /** 登録できる自店舗数 */
  maxStores: number;
  /** 月あたりの近隣抽出ジョブ実行回数 */
  monthlySearches: number;
  /** 月あたりの AI 提案文生成回数 */
  monthlyProposals: number;
  maxMembers: number;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  description: string;
  monthlyPriceJpy: number;
  limits: PlanLimits;
  features: string[];
}

// ---------------------------------------------------------------------------
// UI 表示用のメタ情報
// ---------------------------------------------------------------------------

export interface LabelDefinition<T extends string> {
  value: T;
  label: string;
}

export type CollabTypeLabel = LabelDefinition<CollabType>;
export type ProposalStatusLabel = LabelDefinition<ProposalStatus>;
export type JobStatusLabel = LabelDefinition<JobStatus>;
export type PipelineStageLabel = LabelDefinition<PipelineStage>;
