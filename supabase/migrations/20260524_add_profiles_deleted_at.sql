-- 给 profiles 表加 deleted_at 列，用于区分"停用（可恢复）"和"删除（彻底剥夺登录）"。
-- - is_active = false AND deleted_at IS NULL → 已停用，仍出现在 admin 账号列表
-- - deleted_at IS NOT NULL                    → 已删除，从 admin 账号列表过滤掉
--
-- 软删除流程详见 src-tauri/src/admin_user.rs::admin_soft_delete_user
-- （把 auth.users.email 改成 deleted-<uuid>@deleted.local + 重置密码 + 这里的 deleted_at = now()）

alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- 回填：把已经被软删过（email 已改成 deleted-...@deleted.local）但 deleted_at 还是 NULL 的账号补上时间戳
update public.profiles p
set deleted_at = now()
from auth.users u
where p.id = u.id
  and p.deleted_at is null
  and u.email like 'deleted-%@deleted.local';
