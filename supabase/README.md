# Supabase 接入指引

本目录存放呈尚策划 · 头像店招系统的 Supabase 配置文件。

---

## 一、准备工作（在 Supabase 完成）

### 1. 创建项目

1. 登录 https://supabase.com → **New project**
2. 项目名：`csgh-image-studio`（任意）
3. Database Password：自己设置，妥善保存
4. Region：建议 `Northeast Asia (Tokyo)` 或 `East Asia (Hong Kong)`，国内访问较快

### 2. 执行 schema.sql

1. 项目创建好后，左侧菜单 **SQL Editor → New query**
2. 把本目录下的 `schema.sql` 完整内容粘贴进去
3. 点 **Run**（成功无报错即可，全部语句都是幂等的，可重复执行）

### 3. 创建第一个管理员账号

1. 左侧菜单 **Authentication → Users → Add user → Create new user**
2. 填邮箱 + 密码，**勾选** *Auto Confirm User*（否则需要邮箱验证）
3. 创建后回到 **SQL Editor**，运行下面这段把它升级为 admin：

```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = '换成你的管理员邮箱@example.com');
```

之后再创建普通用户，按相同流程添加（不需要再运行 SQL，会默认 `role='user'`）。

### 4. 收集连接信息

左侧菜单 **Project Settings → API**，把以下两项发给我：

| 名称 | 形如 | 用途 |
|---|---|---|
| **Project URL** | `https://xxxxxxxxxxxx.supabase.co` | 客户端连接地址 |
| **anon public key** | `eyJhbGciOiJIUzI1NiIsInR...` 一长串 | 客户端登录用的公开 key |

> ⚠️ **不要**把 `service_role` 那一栏的 key 发给我，也不要写进任何配置文件。这把 key 能绕过所有 RLS，只该留在 Supabase Dashboard。

---

## 二、本地配置

把上一步拿到的两个值填到项目根目录 `.env.local`：

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR...
```

`.env.local` 已在 `.gitignore` 中，不会提交到仓库。

---

## 三、表结构总览

| 表/视图 | 说明 |
|---|---|
| `profiles` | 用户档案：role、login_count、last_login_at、is_active |
| `generation_logs` | 每张成功生图的记录（shop_name、asset_kind、platform、generation_line、oss_url、created_at） |
| `login_logs` | 登录日志（审计用） |
| `daily_generation_stats` | 视图：按用户 × 日期聚合的生图数量 |

### 历史保留策略

- `generation_logs` 只保留最近 **7 天** 的记录。
- 数据库通过 `pg_cron` 每天自动执行一次 `cleanup_expired_generation_logs()`，无人登录时也会清理。
- 前端登录后与每次成功生图后，也会再调用一次 `cleanup_expired_generation_logs()` 兜底同步。
- 因为 OSS 签名链接 7 天后会失效，所以历史页只展示最近 7 天内仍可访问的记录。

### RLS 行为速查

| 角色 | profiles | generation_logs | login_logs |
|---|---|---|---|
| 普通用户 | 读/改自己（不能改 role） | 读自己 / 写自己 | 读自己 / 写自己 |
| 管理员 | 读/改所有 | 读所有 | 读所有 |

### RPC

- `record_login(p_user_agent text default null)` — 登录成功后由前端调用一次，自动累加 `login_count` + 刷新 `last_login_at` + 写 `login_logs`。
- `cleanup_expired_generation_logs(p_cutoff timestamptz default now() - interval '7 days')` — 删除超过 7 天的历史生图记录，返回删除条数。

---

## 四、新增普通账号的流程

v1 版本 **不在应用内创建账号**（避免把 service_role key 嵌入桌面应用）。流程：

1. 管理员在应用的"后台管理"页面点击 **新增账号** → 弹窗"前往 Supabase 控制台创建" → 默认浏览器打开 `https://supabase.com/dashboard/project/<id>/auth/users`
2. 在 Dashboard 创建用户（勾选 Auto Confirm User）
3. 把邮箱 + 临时密码发给运营同事，让他在应用登录页改密码

> 之后如果不想跳浏览器，可以加一个 Supabase Edge Function 做服务端代理；那一步等 v1 跑通后再说。

---

## 五、常见问题

**Q: 创建用户后没有自动出现在 `profiles` 表？**
A: 检查 `on_auth_user_created` trigger 是否还在；重跑 schema.sql 的"4. 辅助函数"部分即可。

**Q: 普通用户能看到别人的数据？**
A: 检查每张表是否启用了 RLS。在 Dashboard → Table Editor 选中表，右上角应显示 `RLS enabled`。

**Q: 想清空所有生图记录？**
A:
```sql
truncate table public.generation_logs;
truncate table public.login_logs;
```
（这两个表 truncate 不会影响用户）
