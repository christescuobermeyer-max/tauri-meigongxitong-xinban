begin;

-- 保留旧签名兼容计划任务，但不信任客户端传入的截止时间。
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
   where created_at < (now() - interval '7 days');
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_generation_logs(timestamptz) from public;
revoke all on function public.cleanup_expired_generation_logs(timestamptz) from anon;
revoke all on function public.cleanup_expired_generation_logs(timestamptz) from authenticated;
grant execute on function public.cleanup_expired_generation_logs(timestamptz) to service_role;

commit;
