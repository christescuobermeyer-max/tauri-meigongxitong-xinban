# 呈尚策划 · 美工生图系统PRO

> 基于 GPT-Image-2（`gpt-image-2-all`）的桌面应用，针对 **美团** 与 **淘宝闪购** 两大外卖平台批量生成店铺 **头像** 与 **店招** 宣传图。

技术栈：**Tauri 2 + React 18 + TypeScript + Vite 6**。UI 采用 Linear / Vercel / GitHub 风格的克制大厂风（中性灰阶 + 1px 边框 + 充足留白 + 自动适配深浅模式）。

---

## 工作流

1. **填写店铺名称** → 例如「阿牛黄焖鸡米饭（火车站店）」
2. **选择投放平台** → 美团 / 淘宝闪购（决定导出尺寸）
3. **上传产品图** → PNG / JPEG / WebP，最多 5 张
4. **点击「开始生成」**：并发调用 image-2 API 生成
   - **头像**：原图 `1024×1024`
   - **店招**：原图 `1536×1024`
5. **下载**：根据所选平台**整体缩放**（不裁剪，保留完整画面）：
   | 平台 | 头像 | 店招 |
   | --- | --- | --- |
   | 美团 | `800×800` | `692×390` |
   | 淘宝闪购 | `800×800` | `750×423` |

API 单次响应可能长达 6–8 分钟，应用前端 + Rust 后端均已配置 600s 超时与可视化进度。

---

## 目录结构

```
image-2生图系统/
├── package.json
├── vite.config.ts
├── tsconfig.json / tsconfig.node.json
├── index.html
├── src/                            # React 前端
│   ├── main.tsx
│   ├── App.tsx
│   ├── types.ts
│   ├── styles/global.css           # Linear/Vercel 风设计令牌
│   ├── lib/
│   │   ├── platforms.ts            # 平台 → 导出尺寸映射
│   │   ├── prompts.ts              # 头像 / 店招 prompt 构造
│   │   ├── tauri.ts                # 调用 Rust 命令
│   │   └── utils.ts
│   └── components/
│       ├── Sidebar.tsx
│       ├── TopBar.tsx
│       ├── GeneratePanel.tsx       # 输入 + 上传 + prompt 预览
│       ├── ResultPanel.tsx         # 双图预览 + 状态徽章 + 下载/重试
│       ├── ImageUpload.tsx
│       ├── PlatformSelect.tsx
│       ├── Toast.tsx
│       └── Icons.tsx
└── src-tauri/                      # Rust 后端
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── main.rs
        ├── lib.rs                  # 注册 invoke handlers
        ├── api.rs                  # POST api3.wlai.vip / 600s 超时
        └── image_proc.rs           # base64 → resize_exact → save
```

---

## 本地开发

### 前置条件

- Node.js ≥ 18
- Rust（含 stable toolchain）+ Cargo
- Windows：需要 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
- 推荐：`@tauri-apps/cli` 全局或 `npx`

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 准备图标（任意一张 1024×1024 PNG 即可）
npm run tauri -- icon ./source.png

# 3. 检查 Tauri 开发环境（自动选择完整的 Visual Studio C++ 工具链）
npm run tauri:doctor

# 4. 启动开发模式（同时拉起 Vite + Tauri 窗口）
npm run tauri:dev
```

现在 `npm run tauri:dev`、`npm run tauri:build`、`run-dev.bat` 都会自动：

- 优先选择完整可用的 Visual Studio C++ 工具链；
- 自动跳过残缺的 Preview / Insiders 安装；
- 启动前清理当前项目残留的 Vite / Tauri / Rust 进程；
- 统一通过本地 `node_modules/.bin/tauri.cmd` 启动，避免环境漂移。

### 打包

```bash
npm run tauri:build
```

产物位于 `src-tauri/target/release/bundle/`。

---

## 关键实现说明

### 1) API 调用走 Rust 端
Rust 端使用 `reqwest`（rustls）调用 `https://api3.wlai.vip/v1/images/generations`，超时 600s。这样能：
- 绕开 WebView 的 fetch 超时与潜在 CORS 限制；
- 处理大体积 base64 数据更稳健；
- 不暴露 API Key 到前端 JS，且密钥由 `.env.local`、`.env` 或系统环境变量提供，不写入源码。

代码：[src-tauri/src/api.rs](src-tauri/src/api.rs)

### 1.1) 环境变量

仓库提供了 `.env.example` 模板。运行前准备 `.env.local`，填入当前有效的新密钥：

```env
IMAGE_2_API_KEY=替换为 image-2 API 密钥
NEW_PICTURE_WALL_IMAGE2_API_KEY=兼容旧命名，可与上面二选一
ALI_OSS_REGION=oss-cn-hangzhou
ALI_OSS_ACCESS_KEY_ID=替换为阿里云 OSS AccessKey ID
ALI_OSS_ACCESS_KEY_SECRET=替换为阿里云 OSS AccessKey Secret
ALI_OSS_BUCKET=替换为 OSS Bucket 名称
```

### 2) Prompt 设计
头像与店招使用两份独立 prompt，均强调：
- 内容**完整覆盖**整个画布，禁止任何空白边；
- **保留产品图原貌**不做改动；
- 突出店铺名、风格符合外卖平台规范。

代码：[src/lib/prompts.ts](src/lib/prompts.ts)

### 3) 导出时只缩放、不裁剪
Rust 端使用 `image::DynamicImage::resize_exact(w, h, Lanczos3)`，按目标尺寸做整体拉伸，**不会裁掉任何画面内容**。这正是用户在需求中明确要求的「自动拉伸压缩，不裁剪，保留完整图片」。

代码：[src-tauri/src/image_proc.rs](src-tauri/src/image_proc.rs)

### 4) UI 风格令牌
- 字体：Inter / SF Pro / 系统字体（含中文回退）
- 配色：中性灰阶为主，状态色仅在徽章/边框上点缀
- 圆角：6–8px；边框：1px；阴影非常微妙
- 自动深色模式（基于 `prefers-color-scheme`）

代码：[src/styles/global.css](src/styles/global.css)

---

## 品牌故事工作区（新增）

侧边栏「详情页生成」下方提供「品牌故事」分类：

1. 输入 **店铺名称（2–20 字）** + **经营品类**
2. 一键生成：
   - 6 段品牌文案：主文案、副文案、品牌特色标题、品牌亮点文案、细节总标题、3 条细节
   - 5 张配图（顺序生成）：主文案 3:2 / 品牌特色 16:9 / 细节 4:3 × 3
3. 文案点击复制，配图支持单张下载与批量打包
4. 配图归档至 OSS、生图记录写入 Supabase（asset_kind = `brand_story`）

> **图片仍走 image-2**（顶部「生图线路」line1–line5），与三件套、详情页等共用。  
> 文案统一走 yunwu 接口（gemini-3-flash-preview），通过 `BRAND_STORY_THREAD1_TEXT_API_KEY` 配置，详见 `.env.example`。  
> 数据库需执行 `supabase/migrations/20260514_add_brand_story_asset_kind.sql` 扩展 asset_kind 约束。

## 后续可扩展

- 历史记录持久化（SQLite / JSON 文件）
- 批量队列（一次跑多个店铺）
- 支持自定义 prompt 模板
- 在「设置」页显示当前固定接口与环境变量配置方式
