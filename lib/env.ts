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

const PRODUCTION_APP_URL = 'https://collabteras.vercel.app';
const LOCAL_APP_URL = 'http://localhost:3000';

/**
 * 未設定・空文字・空白・不正 URL をすべて公開 URL に寄せる。
 * `.url()` は使わない。Vercel 上の値の揺れで Zod が throw しないこと。
 */
function coerceSiteUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return PRODUCTION_APP_URL;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return PRODUCTION_APP_URL;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    // 不正な値は公開 URL にフォールバックする
  }

  return PRODUCTION_APP_URL;
}

function readSiteUrlFromProcessEnv(): string {
  return coerceSiteUrl(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      PRODUCTION_APP_URL,
  );
}

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrlSchema,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().catch(PRODUCTION_APP_URL),
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
    // SITE_URL はパース前に必ず合法な文字列へ正規化し、Zod の Invalid url を起こさない。
    const parsed = publicSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SITE_URL: readSiteUrlFromProcessEnv(),
    });

    if (parsed.success) {
      cachedPublicEnv = parsed.data;
    } else {
      const recovered = publicSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_SITE_URL: PRODUCTION_APP_URL,
      });
      if (!recovered.success) {
        throw recovered.error;
      }
      cachedPublicEnv = recovered.data;
    }
  }
  return cachedPublicEnv;
}

/**
 * Stripe Checkout など、外部サービスへ渡す絶対 URL のオリジンを決める。
 * `NEXT_PUBLIC_APP_URL` とリクエストの origin を優先し、未設定の本番では
 * 公開 URL にフォールバックする（localhost を返さない）。
 */
export function resolveAppBaseUrl(requestOrigin?: string | null): string {
  const fromEnv = firstAbsoluteUrl(
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_APP_URL,
  );
  const fromOrigin = firstAbsoluteUrl(requestOrigin);

  const candidate = fromEnv ?? fromOrigin;
  if (candidate !== null && !(isProductionRuntime() && isLocalhostUrl(candidate))) {
    return candidate;
  }

  if (isProductionRuntime()) {
    return PRODUCTION_APP_URL;
  }

  return fromOrigin ?? LOCAL_APP_URL;
}

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview')
  );
}

function firstAbsoluteUrl(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim().replace(/\/+$/, '');
    if (normalized === '') {
      continue;
    }
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // 次の候補へ
    }
  }
  return null;
}

function isLocalhostUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function serverEnv(): ServerEnv {
  if (cachedServerEnv === null) {
    // Next.js は `process.env.X` の個別参照だけを静的置換する。
    // `parse(process.env)` だと Server Component 側で service role キーが
    // undefined になり、RLS 回避の読み取りが黙って落ちる。
    cachedServerEnv = serverSchema.parse({
      GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PRICE_ID_LIGHT: process.env.STRIPE_PRICE_ID_LIGHT,
      STRIPE_PRICE_ID_STANDARD: process.env.STRIPE_PRICE_ID_STANDARD,
      STRIPE_PRICE_ID_PRO: process.env.STRIPE_PRICE_ID_PRO,
    });
  }
  return cachedServerEnv;
}
