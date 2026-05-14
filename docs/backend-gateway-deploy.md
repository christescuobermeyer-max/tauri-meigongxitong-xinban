# 后端网关部署说明

## 目标

生产环境推荐把生图接口、OSS 上传、Supabase service_role 全部放到服务器端。桌面安装包只内置后端网关地址，不再把敏感密钥放到员工电脑。

## 后端服务器环境变量

服务器运行 `backend-gateway` 前需要配置：

```bash
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的 anon key
SUPABASE_SERVICE_ROLE_KEY=你的 service role/secret key

IMAGE_2_API_KEY=线路1 key
IMAGE_2_LINE2_API_KEY=线路2 key
VECTORENGINE_IMAGE_2_API_KEY=线路3 key
POCKGO_IMAGE_2_API_KEY=线路4 key
APIMART_IMAGE_2_API_KEY=线路5 key

# 品牌故事文案接口（仅启用 yunwu 线路；图片仍走上述 image-2 线路）
BRAND_STORY_THREAD1_BASE_URL=https://yunwu.ai
BRAND_STORY_THREAD1_TEXT_API_KEY=品牌故事文案 key

ALI_OSS_REGION=oss-cn-hangzhou
ALI_OSS_ACCESS_KEY_ID=你的 OSS access key id
ALI_OSS_ACCESS_KEY_SECRET=你的 OSS access key secret
ALI_OSS_BUCKET=你的 OSS bucket

BACKEND_GATEWAY_HOST=0.0.0.0
BACKEND_GATEWAY_PORT=8787
```

> 品牌故事工作区新增两个端点：
> - `POST /api/brand-story-generate-text`：生成 6 段品牌文案（鉴权同 generate-image，需要 Supabase access_token）
> - `GET  /api/brand-story-thread-availability`：返回 4 条线路可用性，仅暴露线路名称/描述，不暴露密钥本身

## 后端构建与启动

```bash
cd src-tauri
cargo build --release --bin backend-gateway
./target/release/backend-gateway
```

健康检查：

```bash
curl http://服务器地址:8787/health
```

## 桌面端生产构建

桌面端只需要在构建时写入网关地址：

```bash
VITE_BACKEND_GATEWAY_URL=https://你的后端域名 npm run tauri:build
```

Windows PowerShell：

```powershell
$env:VITE_BACKEND_GATEWAY_URL="https://你的后端域名"
npm run tauri:build
```

## 调用保护

后端网关会校验桌面端传入的 Supabase 登录态：

- 未登录或 token 过期：拒绝调用生图和 OSS 上传。
- 后台创建账号：先校验登录态，再复用原有管理员校验逻辑。
- 前端继续使用用户自己的 Supabase token 写入历史记录和后台生图明细。

## 重要说明

不要把服务器 `.env`、`.env.local`、API Key、OSS Key、service_role key 打进桌面安装包，也不要提交到 Git 仓库。
