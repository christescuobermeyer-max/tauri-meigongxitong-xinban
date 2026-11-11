begin;
insert into auth.users (id, email) values
  ('22222222-2222-4222-8222-222222222222', 'dedupe-test@example.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'dedupe-other@example.invalid');

insert into public.generation_logs (user_id, shop_name, asset_kind, platform, oss_url)
values
  ('22222222-2222-4222-8222-222222222222', '幂等测试', 'product', 'meituan', 'https://example.invalid/generated/one.jpg?signature=first'),
  ('22222222-2222-4222-8222-222222222222', '幂等测试', 'product', 'meituan', 'https://example.invalid/generated/one.jpg?signature=renewed'),
  ('22222222-2222-4222-8222-222222222222', '幂等测试', 'product', 'meituan', 'https://example.invalid/generated/two.jpg'),
  ('33333333-3333-4333-8333-333333333333', '其他账号', 'product', 'meituan', 'https://example.invalid/generated/one.jpg');

do $$
begin
  if (select count(*) from public.generation_logs where user_id = '22222222-2222-4222-8222-222222222222') <> 2 then
    raise exception '同一图片不同签名的重试重复写入历史';
  end if;
  if (select total_count from public.generation_totals where user_id = '22222222-2222-4222-8222-222222222222') <> 2 then
    raise exception '重复写入重复增加永久累计';
  end if;
  if (select month_count from public.generation_monthly_totals where user_id = '22222222-2222-4222-8222-222222222222') <> 2 then
    raise exception '重复写入重复增加月累计';
  end if;
  if (select total_count from public.generation_totals where user_id = '33333333-3333-4333-8333-333333333333') <> 1 then
    raise exception '不同账号的记录被误去重';
  end if;
end;
$$;

delete from public.generation_logs where user_id = '22222222-2222-4222-8222-222222222222';
insert into public.generation_logs (user_id, shop_name, asset_kind, platform, oss_url)
values ('22222222-2222-4222-8222-222222222222', '过期重试', 'product', 'meituan', 'https://example.invalid/generated/one.jpg?signature=late');

do $$
begin
  if exists (select 1 from public.generation_logs where user_id = '22222222-2222-4222-8222-222222222222') then
    raise exception '历史清理后旧任务被再次计数';
  end if;
  if has_table_privilege('authenticated', 'public.generation_archive_receipts', 'INSERT')
     or has_table_privilege('authenticated', 'public.generation_archive_receipts', 'SELECT') then
    raise exception '普通账号不能直接访问幂等凭据';
  end if;
end;
$$;
rollback;
