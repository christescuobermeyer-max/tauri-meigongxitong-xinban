-- 永久累计生图数：
-- generation_logs 仍按 7 天历史保留；generation_totals 只增不随历史清理减少。

create table if not exists public.generation_totals (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  total_count integer not null default 0 check (total_count >= 0),
  updated_at  timestamptz not null default now()
);

comment on table public.generation_totals is '每个用户永久累计成功归档到 OSS 的生图数量';
comment on column public.generation_totals.total_count is '永久累计值，只在 generation_logs 插入时递增，不随 7 天历史清理递减';

-- 首次上线时，用当前仍保留的历史记录做基线。重复执行时不把较大的永久累计值覆盖回较小历史值。
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

alter table public.generation_totals enable row level security;

drop policy if exists "totals: self read"  on public.generation_totals;
drop policy if exists "totals: admin read" on public.generation_totals;

create policy "totals: self read"
  on public.generation_totals for select
  using (user_id = auth.uid());

create policy "totals: admin read"
  on public.generation_totals for select
  using (public.is_admin(auth.uid()));
