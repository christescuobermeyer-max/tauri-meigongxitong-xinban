begin;
lock table public.generation_logs in share row exclusive mode;

create table if not exists public.generation_archive_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_kind text not null,
  archive_identity text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, asset_kind, archive_identity)
);
alter table public.generation_archive_receipts enable row level security;
revoke all on public.generation_archive_receipts from public, anon, authenticated;

create or replace function public.generation_archive_identity(oss_url text)
returns text language sql immutable strict
set search_path = pg_catalog
as $$
  select encode(sha256(convert_to(regexp_replace(btrim(oss_url), '[?#].*$', ''), 'UTF8')), 'hex');
$$;

insert into public.generation_archive_receipts (user_id, asset_kind, archive_identity)
select distinct user_id, asset_kind, public.generation_archive_identity(oss_url)
from public.generation_logs
on conflict do nothing;

create or replace function public.claim_generation_archive()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.generation_archive_receipts (user_id, asset_kind, archive_identity)
  values (new.user_id, new.asset_kind, public.generation_archive_identity(new.oss_url))
  on conflict do nothing;
  if not found then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.claim_generation_archive() from public, anon, authenticated;
drop trigger if exists before_generation_log_claim_archive on public.generation_logs;
create trigger before_generation_log_claim_archive
  before insert on public.generation_logs
  for each row execute function public.claim_generation_archive();
commit;
