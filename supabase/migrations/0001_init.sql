-- CollabTeras 初期スキーマ
-- 近隣店舗の抽出 → 相性スコアリング → AI コラボ提案文の生成/管理 を支えるテーブル群。
--
-- 何度実行しても同じ結果になる（冪等）。Supabase の SQL Editor に貼って実行するか、
-- supabase db push で適用する。

begin;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 名前が衝突する旧テーブルを legacy スキーマへ退避
-- organization_id を持たない = CollabTeras のものではない、を判定条件にする。
-- まっさらな DB では何もしない。
-- ---------------------------------------------------------------------------
create schema if not exists legacy;

do $$
declare
  t text;
begin
  foreach t in array array['candidates', 'proposals', 'search_jobs'] loop
    if exists (
         select 1 from pg_tables
         where schemaname = 'public' and tablename = t
       )
       and not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t
           and column_name = 'organization_id'
       )
    then
      execute format('alter table public.%I set schema legacy', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 列挙型
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.plan_tier as enum ('free', 'starter', 'pro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null; end $$;

-- joint_event: 共同イベント / mutual_referral: 相互送客
-- bundle_product: セット商品・コラボメニュー / sns_campaign: SNS 共同企画
-- coupon_exchange: クーポン相互設置
do $$ begin
  create type public.collab_type as enum (
    'joint_event', 'mutual_referral', 'bundle_product',
    'sns_campaign', 'coupon_exchange', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.proposal_status as enum (
    'draft', 'ready', 'sent', 'replied', 'agreed', 'declined', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles: auth.users の公開プロフィール拡張
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- organizations: 契約テナント（店舗オーナー / 運営会社）
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan public.plan_tier not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);

-- ---------------------------------------------------------------------------
-- stores: 自店舗（提案の発信元）
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  category text not null,
  address text,
  latitude double precision,
  longitude double precision,
  google_place_id text,
  website text,
  description text,
  target_customer text,
  strengths text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stores_organization_id_idx
  on public.stores (organization_id);
create unique index if not exists stores_org_place_id_key
  on public.stores (organization_id, google_place_id)
  where google_place_id is not null;

-- ---------------------------------------------------------------------------
-- candidates: 抽出された近隣のコラボ候補店舗
-- ---------------------------------------------------------------------------
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  google_place_id text not null,
  name text not null,
  category text,
  address text,
  latitude double precision,
  longitude double precision,
  distance_meters integer,
  rating numeric(2, 1),
  user_ratings_total integer,
  price_level smallint,
  website text,
  phone text,
  photo_url text,
  -- AI による相性スコア（0-100）と根拠
  compatibility_score smallint check (compatibility_score between 0 and 100),
  score_reasons text[] not null default '{}',
  suggested_collab_types public.collab_type[] not null default '{}',
  is_saved boolean not null default false,
  is_dismissed boolean not null default false,
  raw_place_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists candidates_store_place_id_key
  on public.candidates (store_id, google_place_id);
create index if not exists candidates_organization_id_idx
  on public.candidates (organization_id);
create index if not exists candidates_score_idx
  on public.candidates (store_id, compatibility_score desc nulls last);

-- ---------------------------------------------------------------------------
-- proposals: AI が生成したコラボ提案文
-- ---------------------------------------------------------------------------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  collab_type public.collab_type not null default 'other',
  status public.proposal_status not null default 'draft',
  subject text not null,
  body text not null,
  -- 生成に使ったモデルとプロンプト条件（再現性のため保持）
  model text,
  generation_params jsonb,
  sent_at timestamptz,
  replied_at timestamptz,
  memo text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_organization_id_idx
  on public.proposals (organization_id);
create index if not exists proposals_store_status_idx
  on public.proposals (store_id, status);

-- ---------------------------------------------------------------------------
-- search_jobs: 近隣店舗抽出の非同期ジョブ
-- ---------------------------------------------------------------------------
create table if not exists public.search_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  status public.job_status not null default 'queued',
  radius_meters integer not null default 800,
  categories text[] not null default '{}',
  found_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists search_jobs_store_idx
  on public.search_jobs (store_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at 自動更新
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'organizations', 'stores', 'candidates', 'proposals'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- サインアップ時に profiles を自動作成
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- トリガーが無い時期に作られた既存ユーザーを補填する
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  u.raw_user_meta_data ->> 'full_name',
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- organization_members を直接参照するポリシーは再帰するため、
-- security definer 関数経由で所属判定を行う。
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

alter table public.profiles              enable row level security;
alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;
alter table public.stores                enable row level security;
alter table public.candidates            enable row level security;
alter table public.proposals             enable row level security;
alter table public.search_jobs           enable row level security;

-- profiles: 本人のみ
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- organizations: 所属メンバーのみ閲覧、admin 以上のみ更新
drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations
  for select using (public.is_org_member(id));

drop policy if exists "organizations_update_admin" on public.organizations;
create policy "organizations_update_admin" on public.organizations
  for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- organization_members: 同一組織のメンバーが閲覧、admin 以上が編集
drop policy if exists "members_select_same_org" on public.organization_members;
create policy "members_select_same_org" on public.organization_members
  for select using (public.is_org_member(organization_id));

drop policy if exists "members_write_admin" on public.organization_members;
create policy "members_write_admin" on public.organization_members
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- 業務データ: 所属組織のレコードのみフルアクセス
drop policy if exists "stores_all_member" on public.stores;
create policy "stores_all_member" on public.stores
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "candidates_all_member" on public.candidates;
create policy "candidates_all_member" on public.candidates
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "proposals_all_member" on public.proposals;
create policy "proposals_all_member" on public.proposals
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "search_jobs_all_member" on public.search_jobs;
create policy "search_jobs_all_member" on public.search_jobs
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 組織作成 RPC
-- organizations には INSERT ポリシーを置かない。作成者を owner として登録する
-- ところまでを 1 トランザクションで行うため、この関数だけを入口にする。
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.organizations (name)
  values (org_name)
  returning * into new_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  return new_org;
end;
$$;

revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 権限（Supabase の既定付与に漏れがあった場合の保険）
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles, public.organizations, public.organization_members,
  public.stores, public.candidates, public.proposals, public.search_jobs
to authenticated;

commit;

-- PostgREST のスキーマキャッシュを更新（これをしないと 404 が続くことがある）
notify pgrst, 'reload schema';
