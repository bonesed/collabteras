/**
 * lib/queries が組み立てる select 文字列が、実際のスキーマ上で解決するかだけを確認する。
 * 埋め込み（!inner）の指定ミスは行が 0 件でも PostgREST がエラーを返すため、
 * データを作らずに検証できる。
 *
 *   node --env-file=.env.local scripts/select-smoke.mjs
 */
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '').replace(
  /\/rest\/v1$/,
  '',
);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const cases = [
  {
    name: 'getProposal',
    table: 'proposals',
    select: '*, candidate:candidates!inner(*), store:stores!inner(id, name, category)',
  },
  {
    name: 'listProposals',
    table: 'proposals',
    select: '*, candidate:candidates!inner(id, name, category, photo_url)',
  },
  {
    name: 'listCandidatesForPipeline',
    table: 'candidates',
    select: '*, proposals(id, status, collab_type, subject, body, model, updated_at)',
  },
];

let failed = false;

for (const testCase of cases) {
  const url = `${baseUrl}/rest/v1/${testCase.table}?select=${encodeURIComponent(
    testCase.select,
  )}&limit=1`;

  const response = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });

  const body = await response.text();
  const ok = response.ok;
  failed ||= !ok;

  console.log(`${ok ? 'OK  ' : 'FAIL'} ${testCase.name} (${response.status})`);
  if (!ok) {
    console.log(`     ${body}`);
  }
}

process.exit(failed ? 1 : 0);
