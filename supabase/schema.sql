-- =============================================================================
-- 呈尚策划 · 头像店招系统 — Supabase 数据库 schema
--
-- 使用方法：
--   在 Supabase Dashboard → 左侧 SQL Editor → New query → 粘贴本文件 → Run
--   可重复执行（所有语句均为幂等）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. 扩展
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- -----------------------------------------------------------------------------
-- 1. 用户档案 profiles
--    关联 auth.users，存储角色 / 登录次数 / 最后登录时间 / 是否启用
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null,
  role            text not null default 'user' check (role in ('user', 'admin')),
  login_count     integer not null default 0,
  last_login_at   timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.profiles is '用户档案，1:1 关联 auth.users';
comment on column public.profiles.role is 'user 普通账号 / admin 管理员';

-- -----------------------------------------------------------------------------
-- 2. 生图记录 generation_logs
--    每张成功生成且归档到 OSS 的图片记录一条
-- -----------------------------------------------------------------------------
create table if not exists public.generation_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  shop_name     text not null,
  asset_kind    text not null check (asset_kind in ('avatar', 'storefront', 'poster', 'product', 'p_signboard', 'picture_wall', 'detail_page', 'brand_story', 'data_analysis', 'patrol_script')),
  platform      text not null check (platform in ('meituan', 'taobao')),
  generation_line text check (generation_line in ('line1', 'line2', 'line3', 'line4', 'line5')),
  oss_url       text not null,
  oss_key       text,
  created_at    timestamptz not null default now()
);

alter table public.generation_logs
  add column if not exists generation_line text;

alter table public.generation_logs
  drop constraint if exists generation_logs_asset_kind_check;

alter table public.generation_logs
  add constraint generation_logs_asset_kind_check
  check (asset_kind in ('avatar', 'storefront', 'poster', 'product', 'p_signboard', 'picture_wall', 'detail_page', 'brand_story', 'data_analysis', 'patrol_script'));

alter table public.generation_logs
  drop constraint if exists generation_logs_generation_line_check;

alter table public.generation_logs
  add constraint generation_logs_generation_line_check
  check (generation_line in ('line1', 'line2', 'line3', 'line4', 'line5'));

create index if not exists generation_logs_user_id_created_at_idx
  on public.generation_logs (user_id, created_at desc);

create index if not exists generation_logs_created_at_idx
  on public.generation_logs (created_at desc);

comment on table public.generation_logs is '生图记录，每张图一条';

-- -----------------------------------------------------------------------------
-- 3. 永久累计 generation_totals
--    generation_logs 只保留近 7 天；本表只增不随历史清理减少
-- -----------------------------------------------------------------------------
create table if not exists public.generation_totals (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  total_count integer not null default 0 check (total_count >= 0),
  updated_at  timestamptz not null default now()
);

comment on table public.generation_totals is '每个用户永久累计成功归档到 OSS 的生图数量';
comment on column public.generation_totals.total_count is '永久累计值，只在 generation_logs 插入时递增，不随 7 天历史清理递减';

insert into public.generation_totals (user_id, total_count, updated_at)
select user_id, count(*)::integer as total_count, now()
from public.generation_logs
group by user_id
on conflict (user_id) do update
  set total_count = greatest(public.generation_totals.total_count, excluded.total_count),
      updated_at = now();

create or replace function public.increment_generation_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.generation_totals (user_id, total_count, updated_at)
  values (new.user_id, 1, now())
  on conflict (user_id) do update
    set total_count = public.generation_totals.total_count + 1,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_generation_log_insert_increment_total on public.generation_logs;
create trigger on_generation_log_insert_increment_total
  after insert on public.generation_logs
  for each row execute function public.increment_generation_total();

-- -----------------------------------------------------------------------------
-- 4. 登录日志 login_logs（可选，用于审计）
-- -----------------------------------------------------------------------------
create table if not exists public.login_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  logged_in_at    timestamptz not null default now(),
  user_agent      text
);

create index if not exists login_logs_user_id_logged_in_at_idx
  on public.login_logs (user_id, logged_in_at desc);

-- -----------------------------------------------------------------------------
-- 5. 辅助函数（SECURITY DEFINER）
--    用于打破 RLS 在 profiles 自查时的递归
-- -----------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin' and is_active
  );
$$;

-- 当 auth.users 插入时自动建一条 profiles（display_name 取 user_metadata.display_name 或邮箱前缀）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 登录成功后由前端调用：累加 login_count + 刷新 last_login_at + 写 login_logs
create or replace function public.record_login(p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'record_login: 必须已登录';
  end if;

  update public.profiles
    set login_count   = login_count + 1,
        last_login_at = now()
    where id = uid;

  insert into public.login_logs (user_id, user_agent)
  values (uid, p_user_agent);
end;
$$;

-- 清理 7 天前已过期的生图记录；前端在登录后/成功生图后调用一次
create or replace function public.cleanup_expired_generation_logs(
  p_cutoff timestamptz default (now() - interval '7 days')
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.generation_logs
   where created_at < p_cutoff;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_generation_logs(timestamptz) from public;
grant execute on function public.cleanup_expired_generation_logs(timestamptz) to authenticated;

-- 每天 04:10 UTC 自动清理 7 天前已失效的 OSS 历史记录
select cron.schedule(
  'cleanup-expired-generation-logs',
  '10 4 * * *',
  $$ select public.cleanup_expired_generation_logs(); $$
);

-- -----------------------------------------------------------------------------
-- 6. 视图：每日生图统计 daily_generation_stats
--    按 Asia/Shanghai 切日，前端可直接 select 出每个用户每天的图数量
-- -----------------------------------------------------------------------------
create or replace view public.daily_generation_stats
with (security_invoker = true) as
select
  user_id,
  (created_at at time zone 'Asia/Shanghai')::date as stat_day,
  count(*)                                              as total_count,
  count(*) filter (where asset_kind = 'avatar')         as avatar_count,
  count(*) filter (where asset_kind = 'storefront')     as storefront_count,
  count(*) filter (where asset_kind = 'poster')         as poster_count,
  count(*) filter (where asset_kind = 'product')        as product_count,
  count(*) filter (where asset_kind = 'p_signboard')    as p_signboard_count,
  count(*) filter (where asset_kind = 'picture_wall')   as picture_wall_count,
  count(*) filter (where asset_kind = 'detail_page')    as detail_page_count,
  count(*) filter (where asset_kind = 'brand_story')    as brand_story_count,
  count(*) filter (where asset_kind = 'data_analysis')  as data_analysis_count,
  count(*) filter (where asset_kind = 'patrol_script')  as patrol_script_count
from public.generation_logs
group by user_id, stat_day;

comment on view public.daily_generation_stats is '按用户与日期聚合的生图数量；security_invoker=true 表示沿用调用者的 RLS';

-- -----------------------------------------------------------------------------
-- 7. 行级安全（RLS）
-- -----------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.generation_logs enable row level security;
alter table public.generation_totals enable row level security;
alter table public.login_logs      enable row level security;

-- ---- profiles ---------------------------------------------------------------
drop policy if exists "profiles: self read"    on public.profiles;
drop policy if exists "profiles: admin read"   on public.profiles;
drop policy if exists "profiles: self update"  on public.profiles;
drop policy if exists "profiles: admin update" on public.profiles;

create policy "profiles: self read"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: admin read"
  on public.profiles for select
  using (public.is_admin(auth.uid()));

-- 普通用户只能改 display_name；role/is_active 由 RLS 阻止改写
create policy "profiles: self update"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role      = (select role      from public.profiles where id = auth.uid())
    and is_active = (select is_active from public.profiles where id = auth.uid())
  );

create policy "profiles: admin update"
  on public.profiles for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---- generation_logs --------------------------------------------------------
drop policy if exists "logs: self insert" on public.generation_logs;
drop policy if exists "logs: self read"   on public.generation_logs;
drop policy if exists "logs: admin read"  on public.generation_logs;

create policy "logs: self insert"
  on public.generation_logs for insert
  with check (user_id = auth.uid());

create policy "logs: self read"
  on public.generation_logs for select
  using (user_id = auth.uid());

create policy "logs: admin read"
  on public.generation_logs for select
  using (public.is_admin(auth.uid()));

-- ---- generation_totals ------------------------------------------------------
drop policy if exists "totals: self read"  on public.generation_totals;
drop policy if exists "totals: admin read" on public.generation_totals;

create policy "totals: self read"
  on public.generation_totals for select
  using (user_id = auth.uid());

create policy "totals: admin read"
  on public.generation_totals for select
  using (public.is_admin(auth.uid()));

-- ---- login_logs -------------------------------------------------------------
drop policy if exists "login: self insert" on public.login_logs;
drop policy if exists "login: self read"   on public.login_logs;
drop policy if exists "login: admin read"  on public.login_logs;

create policy "login: self insert"
  on public.login_logs for insert
  with check (user_id = auth.uid());

create policy "login: self read"
  on public.login_logs for select
  using (user_id = auth.uid());

create policy "login: admin read"
  on public.login_logs for select
  using (public.is_admin(auth.uid()));
