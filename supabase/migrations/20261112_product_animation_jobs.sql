-- Separate cloud animation history keeps older clients from decoding GIFs as JPEG.
create table if not exists public.product_animation_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  source_key text not null,
  spec jsonb not null,
  status text not null default 'queued' check(status in ('queued','submitting','running','processing','reconciling','succeeded','failed')),
  upstream_id text,
  credential_hash text,
  result jsonb,
  error text,
  lease_owner uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_animation_one_active_user on public.product_animation_jobs(user_id)
  where status not in ('succeeded','failed');
create index if not exists product_animation_user_history on public.product_animation_jobs(user_id,created_at desc);
alter table public.product_animation_jobs enable row level security;
revoke all on public.product_animation_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.product_animation_jobs to service_role;

create or replace function public.enqueue_product_animation(p_id uuid,p_user uuid,p_hash text,p_source text,p_spec jsonb)
returns setof public.product_animation_jobs language plpgsql security definer set search_path=public as $$
declare existing public.product_animation_jobs;
begin
  perform pg_advisory_xact_lock(61112026);
  select * into existing from public.product_animation_jobs where id=p_id;
  if found then
    if existing.user_id<>p_user or existing.request_hash<>p_hash then
      raise unique_violation using message='request id conflict';
    end if;
    return next existing; return;
  end if;
  if (select count(*) from public.product_animation_jobs where status not in ('succeeded','failed')) >= 20 then
    raise exception using errcode='53300',message='animation queue full';
  end if;
  return query insert into public.product_animation_jobs(id,user_id,request_hash,source_key,spec)
    values(p_id,p_user,p_hash,p_source,p_spec) returning *;
end $$;

create or replace function public.claim_product_animation(p_worker uuid,p_allow_new boolean default true)
returns setof public.product_animation_jobs language plpgsql security definer set search_path=public as $$
declare chosen uuid;
begin
  perform pg_advisory_xact_lock(61112026);
  -- A crash after sending a paid request must never cause another submission.
  update public.product_animation_jobs set status='reconciling',error='提交状态待核对，请勿重复生成',lease_owner=null,lease_until=null,updated_at=now()
    where status='submitting' and lease_until<now();
  select id into chosen from public.product_animation_jobs
    where (lease_until is null or lease_until<now()) and (
      status in ('running','processing') or (status='reconciling' and upstream_id is not null))
    order by updated_at for update skip locked limit 1;
  if chosen is null and p_allow_new and (select count(*) from public.product_animation_jobs where status in ('submitting','running','processing','reconciling')) < 2 then
    select id into chosen from public.product_animation_jobs where status='queued'
      order by created_at for update skip locked limit 1;
  end if;
  if chosen is not null then
    return query update public.product_animation_jobs set lease_owner=p_worker,lease_until=now()+interval '10 minutes',
      status=case when status='queued' then 'submitting' else status end,updated_at=now()
      where id=chosen returning *;
  end if;
end $$;
revoke all on function public.enqueue_product_animation(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.claim_product_animation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.enqueue_product_animation(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.claim_product_animation(uuid,boolean) to service_role;
