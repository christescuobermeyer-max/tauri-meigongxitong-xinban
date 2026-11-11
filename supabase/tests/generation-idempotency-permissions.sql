begin;
insert into auth.users (id, email) values
  ('55555555-5555-4555-8555-555555555555', 'dedupe-permissions@example.invalid'),
  ('66666666-6666-4666-8666-666666666666', 'dedupe-target@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);

do $$
begin
  begin
    insert into public.generation_logs (user_id, shop_name, asset_kind, platform, oss_url)
    values ('66666666-6666-4666-8666-666666666666', '越权测试', 'product', 'meituan', 'https://example.invalid/permission.jpg');
    raise exception '普通账号能够写入其他账号的历史';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.generation_logs (user_id, shop_name, asset_kind, platform, oss_url)
    values ('55555555-5555-4555-8555-555555555555', '失败重试', 'product', 'invalid', 'https://example.invalid/rollback.jpg');
    raise exception '无效平台没有被拒绝';
  exception when check_violation then null;
  end;
end;
$$;

insert into public.generation_logs (user_id, shop_name, asset_kind, platform, oss_url)
values
  ('55555555-5555-4555-8555-555555555555', '正常重试', 'product', 'meituan', 'https://example.invalid/rollback.jpg'),
  ('55555555-5555-4555-8555-555555555555', '重复重试', 'product', 'meituan', 'https://example.invalid/rollback.jpg?signature=retry');
reset role;

do $$
begin
  if exists (select 1 from public.generation_archive_receipts where user_id = '66666666-6666-4666-8666-666666666666') then
    raise exception '越权失败留下了幂等凭据';
  end if;
  if (select total_count from public.generation_totals where user_id = '55555555-5555-4555-8555-555555555555') <> 1 then
    raise exception '失败写入阻止了后续合法重试或重复累计';
  end if;
end;
$$;
rollback;
