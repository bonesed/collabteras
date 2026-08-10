import { z } from 'zod';

/**
 * 環境変数はここでのみ読む。値が不正なまま動き続けるのを防ぐため、参照時に
 * zod で検証する。ビルド時に落とさないよう、検証は初回参照まで遅延させる。
 *
 * - `publicEnv()` はクライアント/サーバー双方から参照可（NEXT_PUBLIC_ のみ）
 * - `serverEnv()` はサーバー専用。クライアントバンドルから呼ばないこと
 */

/**
 * Supabase の Project URL はホスト名のみを指す必要がある。
 * ダッシュボードから `/rest/v1` 付きの URL をコピーしてしまうと、supabase-js が
 * `<url>/auth/v1` を組み立てる際に `/rest/v1/auth/v1` となり認証が全て 404 になる。
 */
const supabaseUrlSchema = z
  .string()
  .url()
  .transform((value) => value.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''));

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrlSchema,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
});

/**
 * 任意の値。`KEY=` と空のまま書かれた変数は「未設定」として扱う。
 * こう書いておかないと、使う予定のないキーの空行だけで検証が落ちる。
 */
const optionalSecret = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

const serverSchema = z.object({
  GOOGLE_MAPS_API_KEY: z.string().min(1),
  // service role キーが要るのは admin クライアントを使う処理（Stripe Webhook）だけ。
  // ここで必須にすると、無関係な画面まで巻き添えで落ちる。
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  GOOGLE_GEMINI_API_KEY: optionalSecret,
  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,
  STRIPE_PRICE_ID_LIGHT: optionalSecret,
  STRIPE_PRICE_ID_STANDARD: optionalSecret,
  STRIPE_PRICE_ID_PRO: optionalSecret,
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

let cachedPublicEnv: PublicEnv | null = null;
let cachedServerEnv: ServerEnv | null = null;

export function publicEnv(): PublicEnv {
  if (cachedPublicEnv === null) {
    // Next.js はビルド時に process.env.X を静的置換するため、個別に列挙して渡す。
    cachedPublicEnv = publicSchema.parse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    });
  }
  return cachedPublicEnv;
}

export function serverEnv(): ServerEnv {
  if (cachedServerEnv === null) {
    cachedServerEnv = serverSchema.parse(process.env);
  }
  return cachedServerEnv;
}
