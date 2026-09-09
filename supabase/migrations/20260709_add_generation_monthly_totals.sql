-- 月度累计生图数：
-- generation_logs 仍按历史保留策略清理；generation_monthly_totals 只增不随历史清理减少。

create table if not exists public.generation_monthly_totals (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  stat_month  date not null,
  month_count integer not null default 0 check (month_count >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, stat_month)
);

comment on table public.generation_monthly_totals is '每个用户按 Asia/Shanghai 自然月累计成功归档到 OSS 的生图数量';
comment on column public.generation_monthly_totals.stat_month is '上海时区自然月第一天，例如 2026-07-01';
comment on column public.generation_monthly_totals.month_count is '月度累计值，只在 generation_logs 插入时递增，不随 7 天历史清理递减';

insert into public.generation_monthly_totals (user_id, stat_month, month_count, updated_at)
select
  user_id,
  date_trunc('month', created_at at time zone 'Asia/Shanghai')::date as stat_month,
  count(*)::integer as month_count,
  now()
from public.generation_logs
group by user_id, stat_month
on conflict (user_id, stat_month) do update
  set month_count = greatest(public.generation_monthly_totals.month_count, excluded.month_count),
      updated_at = now();

create or replace function public.increment_generation_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shanghai_month date := date_trunc('month', new.created_at at time zone 'Asia/Shanghai')::date;
begin
  insert into public.generation_totals (user_id, total_count, updated_at)
  values (new.user_id, 1, now())
  on conflict (user_id) do update
    set total_count = public.generation_totals.total_count + 1,
        updated_at = now();

  insert into public.generation_monthly_totals (user_id, stat_month, month_count, updated_at)
  values (new.user_id, shanghai_month, 1, now())
  on conflict (user_id, stat_month) do update
    set month_count = public.generation_monthly_totals.month_count + 1,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_generation_log_insert_increment_total on public.generation_logs;
drop trigger if exists on_generation_log_insert_increment_counters on public.generation_logs;
create trigger on_generation_log_insert_increment_counters
  after insert on public.generation_logs
  for each row execute function public.increment_generation_counters();

alter table public.generation_monthly_totals enable row level security;

drop policy if exists "monthly_totals: self read"  on public.generation_monthly_totals;
drop policy if exists "monthly_totals: admin read" on public.generation_monthly_totals;

create policy "monthly_totals: self read"
  on public.generation_monthly_totals for select
  using (user_id = auth.uid());

create policy "monthly_totals: admin read"
  on public.generation_monthly_totals for select
  using (public.is_admin(auth.uid()));
