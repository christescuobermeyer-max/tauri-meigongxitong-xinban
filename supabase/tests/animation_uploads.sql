begin;
insert into auth.users(id,email) values ('5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a','uploads@example.invalid');
do $$
begin
  insert into public.animation_uploads(id,user_id,style,title,format,width,height,duration_ms,frames,bytes,oss_key,poster_key)
    values ('6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b','5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a','video','抖音 · 招牌牛肉面','gif',768,576,3000,60,2400000,
      'product-animations/u/a/result.gif','product-animations/u/a/poster.jpg');
  begin
    insert into public.animation_uploads(id,user_id,style,format,width,height,duration_ms,frames,bytes,oss_key,poster_key)
      values ('6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b','5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a','video','gif',768,576,3000,60,1,'product-animations/x','product-animations/y');
    raise exception 'duplicate id accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.animation_uploads(id,user_id,style,format,width,height,duration_ms,frames,bytes,oss_key,poster_key)
      values (gen_random_uuid(),'5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a','video','gif',768,576,3000,60,5000001,'product-animations/x','product-animations/y');
    raise exception 'oversized animation accepted';
  exception when check_violation then null; end;
  begin
    insert into public.animation_uploads(id,user_id,style,format,width,height,duration_ms,frames,bytes,oss_key,poster_key)
      values (gen_random_uuid(),'5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a','video','gif',768,576,3000,60,1,'uploads/x','product-animations/y');
    raise exception 'foreign object key accepted';
  exception when check_violation then null; end;
  if has_table_privilege('authenticated','public.animation_uploads','SELECT') or has_table_privilege('anon','public.animation_uploads','SELECT') then
    raise exception 'upload table exposed to clients';
  end if;
  if not has_table_privilege('service_role','public.animation_uploads','INSERT') then raise exception 'gateway cannot insert'; end if;
  delete from auth.users where id='5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a';
  if exists(select 1 from public.animation_uploads where id='6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b') then raise exception 'uploads survive account deletion'; end if;
end $$;
rollback;
