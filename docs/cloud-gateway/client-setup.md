# 6 台员工电脑客户端配置指南

> 本文档面向 IT 管理员，部署在 6 台 Windows 员工电脑上的简化版安装流程。
> 前提：云端网关已按 `README.md` 部署完成并通过 `https://gw.yourcompany.com/health` 健康检查。

---

## 一、安装包准备

在你的开发机（Windows）执行：

```powershell
# 进入项目根目录
cd F:\christescuobermeyer-max\image-2生图系统

# 临时设置网关地址环境变量（仅本次构建生效）
$env:VITE_BACKEND_GATEWAY_URL="https://gw.yourcompany.com"
$env:VITE_SUPABASE_URL="https://你的项目.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="你的_anon_public_key"

# 构建桌面安装包
npm run tauri:build
```

构建产物位置：
```
src-tauri\target\release\bundle\msi\呈尚策划美工生图系统PRO_2.0.0_x64_zh-CN.msi
```

> **关键安全检查**：客户端构建产物**只内置 4 个值**：
> - `VITE_BACKEND_GATEWAY_URL`（网关公网地址）
> - `VITE_SUPABASE_URL`（公开值，本来就在前端可见）
> - `VITE_SUPABASE_ANON_KEY`（受 RLS 保护的公开 key）
>
> **绝对不放**：
> - ✗ 5 条生图线路的 API Key
> - ✗ OSS AccessKey
> - ✗ Supabase service_role / secret key
>
> 即便 MSI 被员工拷出去逆向，也拿不到任何敏感凭证。

---

## 二、6 台员工电脑安装步骤

### 每台员工电脑

1. 复制 MSI 安装包到员工电脑（U 盘、企业网盘、共享文件夹任选）
2. 双击 MSI → 一路下一步 → 完成
3. 桌面会出现「呈尚策划美工生图系统PRO」快捷方式
4. 启动后输入 Supabase 账号密码登录即可使用

### 账号开通流程

由你（管理员）在自己的电脑上：
1. 用管理员账号登录
2. 进入「后台」→「账号管理」→「新增账号」
3. 填写员工的姓名、邮箱、初始密码
4. 把账号密码发给对应员工

> 员工电脑上的「新增账号」按钮调用 `/api/admin-create-user`，网关会自动校验调用方是否为管理员角色，普通员工点了会被拒绝。

---

## 三、客户端无法启动 / 调用失败排查

### 1. 启动闪退

打开 Windows 事件查看器 → 应用程序日志，筛选 `csgh-image-studio.exe`。

最常见原因：构建时没设置 `VITE_BACKEND_GATEWAY_URL` 或 `VITE_SUPABASE_URL` 环境变量。重新构建。

### 2. 登录提示「网络错误」

```powershell
# 在员工电脑 PowerShell 测试
curl https://gw.yourcompany.com/health
curl https://你的项目.supabase.co/auth/v1/health
```

- 第一条失败 → 网关或域名问题，回 `README.md` 第五节
- 第二条失败 → 员工电脑 DNS / 跨境网络问题（极少见，通常香港 Supabase 直连无障碍）

### 3. 生图调用 502 / 超时

去云端网关查日志：

```bash
sudo journalctl -u csgh-backend-gateway --since "10 min ago" | grep ERROR
```

常见：
- 上游线路 API Key 失效 → 编辑 gateway.env → `systemctl restart csgh-backend-gateway`
- 上游 API 短暂抖动或响应很慢 → 客户端只等待本次请求结果，不会自动重试扣费

### 4. 上传图片失败

```bash
# 测试 OSS 连通性（在云端服务器）
sudo -u csgh /opt/csgh-gateway/bin/backend-gateway --help 2>&1 | head -5
```

如果 OSS 调用失败，多半是 RAM 子账号权限不够。最小授权策略：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:PutObject", "oss:GetObject", "oss:DeleteObject"],
      "Resource": ["acs:oss:*:*:你的bucket名/*"]
    }
  ]
}
```

---

## 四、版本升级（推 N+1 版到员工电脑）

1. 在云端服务器更新网关：`sudo bash docs/cloud-gateway/update.sh`
2. 在开发机重新打包 MSI（同上「一」节）
3. 把新 MSI 推给员工，**直接安装覆盖**（Tauri MSI 支持原地升级，保留登录态）

> 客户端和网关的版本兼容策略：网关接口稳定（`/api/generate-image` 等不会改），新版客户端可调旧版网关、旧版客户端也能调新版网关。**不需要严格同时升级**。

---

## 五、客户端的环境变量优先级

`src/lib/tauri.ts` 的判断逻辑（仅供参考，无需修改）：

```ts
function getBackendGatewayUrl(): string | null {
  const url = import.meta.env.VITE_BACKEND_GATEWAY_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

// 有 gateway URL → 走 fetch HTTPS
// 没有 → 回退本地 Tauri invoke（开发模式 / 单机模式）
```

这意味着：
- **生产 MSI 安装包**：构建时有 `VITE_BACKEND_GATEWAY_URL` → 走云端网关
- **开发者本机调试**：删除环境变量 → 自动走本地 Tauri，可以用本地的密钥不影响线上

---

## 六、给员工的简明使用须知（可打印一页）

```
┌────────────────────────────────────────────┐
│  呈尚策划美工生图系统PRO  使用须知          │
├────────────────────────────────────────────┤
│ 1. 双击桌面快捷方式启动                      │
│ 2. 用公司分配的账号登录                      │
│ 3. 上传产品图 → 选择生图类型 → 等待生成      │
│ 4. 生成结果会自动保存到云端，可在「历史记录」  │
│    随时查看 / 重新下载                       │
│ 5. 遇到问题截图发 IT 管理员                  │
│                                            │
│ ⚠ 不要把账号密码告诉他人                     │
│ ⚠ 离开电脑请退出登录或锁屏                   │
└────────────────────────────────────────────┘
```
