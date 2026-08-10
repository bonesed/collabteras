/**
 * 認証まわりの疎通確認。捨てアカウントで signUp → signOut → signInWithPassword を
 * 通し、成功可否だけを出力する。確認が終わったら Supabase 側でユーザーを削除する。
 *
 *   node --env-file=.env.local scripts/auth-smoke.mjs
 *
 * supabase-js は Realtime の初期化に WebSocket を要求し Node 20 では動かないため、
 * ここでは認証部分だけを担う auth-js を直接使う。
 */
import { AuthClient } from '@supabase/auth-js';

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '').replace(
  /\/rest\/v1$/,
  '',
);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const auth = new AuthClient({
  url: `${baseUrl}/auth/v1`,
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  persistSession: false,
});

const email = `smoke+${Date.now()}@collabteras.test`;
const password = 'SmokeTest12345!';

const signUpResult = await auth.signUp({
  email,
  password,
  options: { data: { full_name: 'スモークテスト' } },
});

console.log('signUp error      :', signUpResult.error?.message ?? 'none');
console.log('signUp user       :', signUpResult.data.user !== null);
console.log('signUp session    :', signUpResult.data.session !== null);

const userId = signUpResult.data.user?.id;

await auth.signOut();

const signInResult = await auth.signInWithPassword({ email, password });

console.log('signIn error      :', signInResult.error?.message ?? 'none');
console.log('signIn session    :', signInResult.data.session !== null);

const accessToken = signInResult.data.session?.access_token;

if (userId !== undefined && accessToken !== undefined) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };

  const profileResponse = await fetch(
    `${baseUrl}/rest/v1/profiles?select=id,full_name&id=eq.${userId}`,
    { headers },
  );
  console.log('profiles status   :', profileResponse.status);
  console.log('profiles body     :', await profileResponse.text());

  const memberResponse = await fetch(
    `${baseUrl}/rest/v1/organization_members?select=organization_id,role&user_id=eq.${userId}`,
    { headers },
  );
  console.log('members status    :', memberResponse.status);
  console.log('members body      :', await memberResponse.text());
}

console.log('test email        :', email);
