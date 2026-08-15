# CollabTeras（コラボテラス）

近隣エリアの相性が良い店舗を Google Maps / Web から自動抽出し、AI が「コラボ提案文」を生成・管理する B2B SaaS です。

## 技術スタック

| 領域 | 採用技術 |
| --- | --- |
| フレームワーク | Next.js 15（App Router, TypeScript）/ React 19 |
| スタイリング | Tailwind CSS, Shadcn/ui |
| DB / 認証 | Supabase（PostgreSQL, Row Level Security） |
| AI | OpenAI API (GPT-4o) / Google Gemini API |
| 決済 | Stripe Billing |
| アイコン | Lucide React |

## セットアップ

```bash
npm install
cp .env.example .env.local   # 各キーを埋める
npm run dev
```

`http://localhost:3000` で起動します。

### Supabase の初期化

1. Supabase でプロジェクトを作成する
2. SQL Editor で `supabase/migrations/0001_init.sql` を実行する
3. Project Settings > API のキーを `.env.local` に設定する

`0001_init.sql` は冪等なので、途中で失敗しても貼り直して再実行できます。
`candidates` / `proposals` / `search_jobs` と同名の無関係なテーブルが既にある場合は、
削除せず `legacy` スキーマへ退避します。

スキーマを変更したら、TypeScript の型も合わせて更新します。

```bash
npx supabase gen types typescript --project-id <PROJECT_ID> --schema public > types/database.ts
```

### Google Cloud の設定

Google Cloud のプロジェクトで次の 2 つの API を有効化し、キーを
`GOOGLE_MAPS_API_KEY` に設定します。

- **Places API (New)** — 近隣店舗の取得と写真
- **Geocoding API** — 店舗住所から緯度経度への変換

キーはサーバー側でのみ使用します。店舗写真は `/api/place-photo` のプロキシ経由で
配信し、キーがブラウザに渡らないようにしています。

### AI プロバイダ

`OPENAI_API_KEY` があれば GPT-4o を、無ければ `GOOGLE_GEMINI_API_KEY` で
Gemini を使います。どちらも未設定だと相性スコアリングは失敗します。

### Stripe Billing

未設定でもアプリは動きます。その場合 `/settings/billing` はプランの一覧表示だけになり、
購入ボタンは無効になります。有効にするには次の 3 つを行います。

1. Stripe でライト / スタンダード / プロの商品を月次サブスクリプションとして作成し、
   Price ID（`price_` で始まる ID。`prod_` ではない）を `STRIPE_PRICE_ID_LIGHT` /
   `STRIPE_PRICE_ID_STANDARD` / `STRIPE_PRICE_ID_PRO` に設定する
2. `STRIPE_SECRET_KEY` を設定する
3. Webhook を `/api/webhooks/stripe` に向け、署名シークレットを
   `STRIPE_WEBHOOK_SECRET` に設定する

ローカルでは Stripe CLI で転送します。

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

購読する必要があるイベントは `checkout.session.completed` と
`customer.subscription.created` / `updated` / `deleted` の 4 つです。
Webhook はプランの反映に service role を使うため、`SUPABASE_SERVICE_ROLE_KEY`
の設定も必要になります。

## ディレクトリ構成

```
app/
  (auth)/            ログイン・新規登録（認証前のみ表示）
  (dashboard)/       ログイン後の管理画面。layout.tsx でセッションを検証する
  auth/callback/     メール確認 / OAuth のコールバック
  onboarding/        組織作成
components/
  ui/                Shadcn/ui の primitive。原則として手を入れない
  features/          業務ロジックを含むコンポーネント（機能ごとに分割）
  brand/             ロゴなどブランド表現
lib/
  supabase/          client（ブラウザ）/ server（RSC・Actions）/ admin（service role）
  queries/           サーバー側のデータ取得関数
  google/            Places API（近隣検索）と Geocoding API
  ai/                プロバイダ抽象層（OpenAI / Gemini）と相性スコアリング
  stripe/            Stripe クライアント、プランと Price の対応、購読状態の同期
  env.ts             環境変数の zod 検証
types/
  database.ts        Supabase スキーマ型（自動生成）
  index.ts           ドメイン型・Server Action の入出力契約
supabase/migrations/ SQL マイグレーション
```

## 設計上の約束

- `any` は使わない。DB 行は `Tables<'テーブル名'>` を経由して参照する。
- データ取得は Server Components、更新は Server Actions を基本とする。
- ユーザー起点の処理では必ず `lib/supabase/server.ts` を使い、RLS を効かせる。
  `lib/supabase/admin.ts`（service role）は Stripe Webhook などログインユーザーが
  存在しない文脈に限る。
- 業務テーブルは `organization_id` を必ず持たせ、RLS で組織単位に隔離する。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run lint` | ESLint |
| `npm run typecheck` | 型チェック（`tsc --noEmit`） |

## 実装状況

- 認証（メール + パスワード）、組織作成、セッション保護 middleware
- 自店舗の一覧・登録・編集・削除（住所を変更すると座標を取り直す）
- Google Places による近隣店舗の抽出と、AI による相性スコアリング（0-100 とその理由）
- 抽出履歴とプラン別の月間実行回数の制限
- AI によるコラボ提案文の生成（提案タイプ・トーン選択、編集、クリップボードコピー）
- 提案の詳細・編集（本文の手直し、ステータス変更、やり取りのメモ、削除）
- コラボ候補のカンバン管理（ドラッグ＆ドロップ / ステータス選択で進捗を更新）
- Stripe Billing によるプラン変更（Checkout / カスタマーポータル / Webhook）
- ダッシュボード（集計カード、最近の提案）、提案一覧、設定

### カンバンの列と DB の対応

`/candidates` のカンバンの列（`PipelineStage`）はテーブルの列ではなく、
`candidates.is_dismissed` と、その候補で最新の `proposals.status` から導出しています。
対応関係は `lib/pipeline.ts` に集約してあります。

| 列 | DB 側の状態 |
| --- | --- |
| 未アプローチ | 有効な提案がない（未作成、またはすべて `archived`） |
| 提案文作成済み | `draft` / `ready` |
| 送信済み | `sent`（初回移動時に `sent_at` を記録） |
| 返信あり（交渉中） | `replied`（初回移動時に `replied_at` を記録） |
| 提携成立 | `agreed` |
| 見送り | `declined`、または `candidates.is_dismissed` |

提案文を生成し直して保存すると、それまでの版を `archived` にしたうえで新しい行を
追加します。手直しだけの保存は同じ行を更新するため、行が無駄に増えません。

### 抽出処理について

現状、近隣抽出は Server Action の中で同期的に実行しています（Places の取得 →
AI の採点 → 保存）。候補が多いと 1 分前後かかるため、`/candidates/search` には
`maxDuration = 120` を設定しています。将来的にはジョブキューに逃がす想定で、
`search_jobs` テーブルに状態を持たせてあります。
