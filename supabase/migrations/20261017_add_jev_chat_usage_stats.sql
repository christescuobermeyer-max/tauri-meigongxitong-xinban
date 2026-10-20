-- 微信助手统计与生图数据隔离；只记录成功调用元数据，不保存聊天正文。
create schema if not exists jev_chat_stats;
revoke all on schema jev_chat_stats from public, anon, authenticated;
grant usage on schema jev_chat_stats to service_role;

create table if not exists jev_chat_stats.success_calls (
  request_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stat_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists jev_chat_stats.daily_counts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  stat_date date not null,
  success_count bigint not null default 0 check (success_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, stat_date)
);

create table if not exists jev_chat_stats.total_counts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  success_count bigint not null default 0 check (success_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists success_calls_user_created_idx
  on jev_chat_stats.success_calls (user_id, created_at desc);

alter table jev_chat_stats.success_calls enable row level security;
alter table jev_chat_stats.daily_counts enable row level security;
alter table jev_chat_stats.total_counts enable row level security;

revoke all on all tables in schema jev_chat_stats from public, anon, authenticated;
grant select, insert on jev_chat_stats.success_calls to service_role;
grant select, insert, update on jev_chat_stats.daily_counts to service_role;
grant select, insert, update on jev_chat_stats.total_counts to service_role;

create or replace function public.record_jev_chat_success(p_user_id uuid, p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, jev_chat_stats
as $$
declare
  v_date date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'user_id and request_id are required';
  end if;
  insert into jev_chat_stats.success_calls (request_id, user_id, stat_date)
  values (p_request_id, p_user_id, v_date)
  on conflict (request_id) do nothing;
  if not found then
    return false;
  end if;
  insert into jev_chat_stats.daily_counts (user_id, stat_date, success_count, updated_at)
  values (p_user_id, v_date, 1, now())
  on conflict (user_id, stat_date) do update
    set success_count = jev_chat_stats.daily_counts.success_count + 1, updated_at = now();
  insert into jev_chat_stats.total_counts (user_id, success_count, updated_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update
    set success_count = jev_chat_stats.total_counts.success_count + 1, updated_at = now();
  return true;
end;
$$;

create or replace function public.get_jev_chat_usage(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, jev_chat_stats
stable
as $$
  select jsonb_build_object(
    'today', coalesce((select success_count from jev_chat_stats.daily_counts
      where user_id = p_user_id and stat_date = (now() at time zone 'Asia/Shanghai')::date), 0),
    'total', coalesce((select success_count from jev_chat_stats.total_counts
      where user_id = p_user_id), 0)
  );
$$;

revoke all on function public.record_jev_chat_success(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_jev_chat_usage(uuid) from public, anon, authenticated;
grant execute on function public.record_jev_chat_success(uuid, uuid) to service_role;
grant execute on function public.get_jev_chat_usage(uuid) to service_role;

comment on schema jev_chat_stats is '微信助手成功回复调用统计，独立于美工生图数据';
comment on table jev_chat_stats.success_calls is '微信助手每次成功生成候选的去重事件，不含聊天内容';
comment on table jev_chat_stats.daily_counts is '微信助手账号按 Asia/Shanghai 自然日累计成功调用次数';
comment on table jev_chat_stats.total_counts is '微信助手账号永久累计成功调用次数';

