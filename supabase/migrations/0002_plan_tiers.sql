-- ---------------------------------------------------------------------------
-- プラン体系の改定
--   free / starter / pro  ->  free / light / standard / pro
--
-- starter は light に名称変更する。RENAME VALUE はラベルだけを差し替えるため、
-- 既存の organizations.plan は追従し、データ移行は不要。
-- ---------------------------------------------------------------------------

do $$ begin
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'plan_tier'
       and e.enumlabel = 'starter'
  ) then
    alter type public.plan_tier rename value 'starter' to 'light';
  end if;
end $$;

-- ADD VALUE は関数/DO ブロック内から実行できないため、トップレベルで書く。
-- 並び順を free < light < standard < pro に保つため pro の前に挿入する。
alter type public.plan_tier add value if not exists 'standard' before 'pro';
