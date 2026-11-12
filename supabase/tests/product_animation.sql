begin;
insert into auth.users(id,email) values ('55555555-5555-4555-8555-555555555555','animation@example.invalid');
do $$
declare j public.product_animation_jobs; c public.product_animation_jobs;
begin
  select * into j from public.enqueue_product_animation('66666666-6666-4666-8666-666666666666','55555555-5555-4555-8555-555555555555','hash','source', '{"width":1024,"height":768,"durationMs":3000,"format":"gif","style":"steam"}');
  select * into c from public.enqueue_product_animation(j.id,j.user_id,'hash','source',j.spec);
  if c.id <> j.id then raise exception 'idempotency broken'; end if;
  begin
    perform public.enqueue_product_animation(j.id,j.user_id,'different','source',j.spec);
    raise exception 'different request accepted';
  exception when unique_violation then null; end;
  begin
    perform public.enqueue_product_animation('77777777-7777-4777-8777-777777777777',j.user_id,'hash2','source',j.spec);
    raise exception 'two jobs for same user accepted';
  exception when unique_violation then null; end;
  if exists(select 1 from public.claim_product_animation('88888888-8888-4888-8888-888888888888',false)) then raise exception 'disabled worker submitted new job'; end if;
  select * into c from public.claim_product_animation('88888888-8888-4888-8888-888888888888');
  if c.id <> j.id or c.status <> 'submitting' then raise exception 'claim broken'; end if;
  if exists(select 1 from public.claim_product_animation('99999999-9999-4999-8999-999999999999')) then raise exception 'double claim'; end if;
  update public.product_animation_jobs set lease_until=now()-interval '1 second' where id=j.id;
  perform public.claim_product_animation('99999999-9999-4999-8999-999999999999');
  if (select status from public.product_animation_jobs where id=j.id) <> 'reconciling' then raise exception 'ambiguous submit retried'; end if;
  update public.product_animation_jobs set upstream_id='already-accepted',lease_until=null where id=j.id;
  select * into c from public.claim_product_animation('99999999-9999-4999-8999-999999999999',false);
  if c.id<>j.id or c.upstream_id<>'already-accepted' then raise exception 'disabled worker cannot recover existing job'; end if;
  if has_table_privilege('authenticated','public.product_animation_jobs','SELECT') then raise exception 'private job table exposed'; end if;
  if has_function_privilege('authenticated','public.claim_product_animation(uuid,boolean)','EXECUTE') then raise exception 'worker RPC exposed'; end if;
end $$;
rollback;
