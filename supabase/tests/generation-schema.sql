begin;
insert into auth.users (id, email)
values ('11111111-1111-4111-8111-111111111111', 'schema-test@example.invalid');

insert into public.generation_logs (user_id, shop_name, asset_kind, platform, oss_url, elapsed_ms)
values ('11111111-1111-4111-8111-111111111111', '初始化测试', 'product', 'meituan', 'https://example.invalid/schema-test.jpg', 1200);

do $$
begin
  if (select elapsed_ms from public.generation_logs where user_id = '11111111-1111-4111-8111-111111111111') <> 1200 then
    raise exception '初始化后无法保存生成耗时';
  end if;
  if (select total_count from public.generation_totals where user_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception '生成记录没有更新累计统计';
  end if;
end;
$$;
rollback;
