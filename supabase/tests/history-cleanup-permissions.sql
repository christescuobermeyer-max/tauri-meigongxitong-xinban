-- 在应用迁移后的受控数据库执行；只检查定义和权限，不删除历史。
begin;
do $$
begin
  if has_function_privilege('authenticated', 'public.cleanup_expired_generation_logs(timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.cleanup_expired_generation_logs(timestamptz)', 'EXECUTE') then
    raise exception '普通或匿名角色仍可执行全库历史清理';
  end if;
  if not has_function_privilege('service_role', 'public.cleanup_expired_generation_logs(timestamptz)', 'EXECUTE') then
    raise exception '受控服务角色没有历史清理权限';
  end if;
  if position('where created_at < (now() - interval ''7 days'')' in
      pg_get_functiondef('public.cleanup_expired_generation_logs(timestamptz)'::regprocedure)) = 0 then
    raise exception '历史清理未使用服务器固定截止时间';
  end if;
end;
$$;
rollback;
