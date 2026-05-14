# 品牌故事工作区迁移开发计划

> 制定日期：2026-05-14
> 源项目：`F:\baech0485-code\meituan-pinpaigushi`（Next.js 16 + React 19）
> 目标项目：`F:\christescuobermeyer-max\image-2生图系统`（Tauri 2 + React 18）

---

## 1. 需求梳理

### 1.1 用户目标
将一个独立的 Next.js"美团品牌故事生成器"完整迁移到当前 Tauri 桌面应用，作为侧边栏"详情页生成"下方的新分类「品牌故事」。

### 1.2 业务流程（与源项目一致）
1. 用户输入 **店铺名称（2–20 字）** + **经营品类**
2. 选择 **文案 / 配图线路**（thread1–thread4 四条）
3. 点击「生成品牌故事」：
   - **第一步**：调用 LLM 文本接口，生成 6 个字段的 `BrandCopy`
     - `mainSlogan`（主文案 4–8 字）
     - `subSlogan`（副文案 8–14 字）
     - `featureTitle`（品牌特色标题 6–18 字）
     - `featureContent`（品牌亮点文案 ≤250 字）
     - `detailsTitle`（细节总标题 6–18 字）
     - `details[3]`（每项 `title` 2–6 字 + `content` 40–50 字）
   - **第二步**：根据 BrandCopy 顺序生成 **5 张配图**
     - 图 1：主文案配图，比例 `3:2`
     - 图 2：品牌特色配图，比例 `16:9`
     - 图 3–5：细节展示配图，比例 `4:3`
4. 文案以可点击复制的卡片展示，配图以网格展示，支持单张下载与批量打包下载

### 1.3 关键调整（按用户明确要求）
| 维度 | 源项目 | 当前项目策略 |
| --- | --- | --- |
| 文案生成 | 走源项目 4 条线路（yunwu/糖果/向量/128） | **保留 4 条线路**，移植到 Rust 后端 |
| 图片生成 | 走 4 条线路的 Gemini Image / 兼容 OpenAI 接口 | **改用当前项目 image-2 调用**（`generateImage` line1–line5） |
| 图片归档 | OSS `generated/<date>/<uuid>.<ext>` | 复用 `compressAndArchiveGenerated`，新增 `brand_story` AssetKind |
| 云数据库 | 无 | 写入 Supabase `generation_logs`，asset_kind=`brand_story` |
| 布局 | 单列居中 | **左输入 / 右结果**，与详情页一致 |
| 下载导出 | 浏览器下载 / Tauri postMessage | 复用 `pickSavePath` / `pickDirectoryPath` + `resizeAndSaveImage` |

### 1.4 与当前项目其他工具的对齐
- 顶部线路条 `GenerationLineCard` —— 控制 **图片生成线路**（line1–line5），与全局 `generationLine` 共享
- 工作区独立的 **文案线路** —— 4 条 thread 选项（thread1–thread4），仅作用于本页面文本接口
- 历史记录 / 后台管理 / OSS 归档行为与"详情页生成"一致
- 商家沟通文案卡（`MerchantCopyCard`）默认显示「品牌故事战略价值」文案

---

## 2. 源项目核心代码盘点

| 源文件 | 作用 | 迁移去向 |
| --- | --- | --- |
| `prompt.md` | 文案 system prompt | 嵌入 Rust 端常量（避免运行时读文件） |
| `lib/brand-story-types.ts` | BrandCopy / ThreadId / ThreadAvailability | `src/types.ts` 扩展 |
| `lib/brand-story-text.ts` | system prompt 包装 + JSON 解析 | 部分嵌入 Rust，部分保留前端 |
| `lib/brand-story-clients.ts` | 双协议（gemini / openai）请求/解析 | **Rust 端完全重写**（文本） |
| `lib/brand-story-threads.ts` | 4 条线路定义 + 环境变量解析 + 可用性 | Rust 端 `brand_story.rs::threads` |
| `lib/brand-story-images.ts` | 5 张配图的 aspectRatio + prompt | `src/lib/brand-story.ts` |
| `lib/brand-story-image-storage.ts` | OSS 上传（含 inline 回退） | 不迁移，复用 `compressAndArchiveGenerated` |
| `lib/brand-story-constants.ts` | 战略价值文案 | `src/lib/brand-story.ts` |
| `app/api/generate-text/route.ts` | 文本生成 API 路由 | `src-tauri/src/brand_story.rs` + Tauri 命令 |
| `app/api/generate-images/route.ts` | 图片生成 API 路由 | 不迁移（前端直接调 `generateImage`） |
| `app/api/brand-story-threads/route.ts` | 线路可用性 | Rust Tauri 命令 |
| `components/InputForm.tsx` | 输入表单 | 新 `BrandStoryPage` |
| `components/CopySection.tsx` | 文案展示 | 新 `BrandStoryCopyBlock` |
| `components/ImageSection.tsx` | 图片网格 + 批量下载 | 新 `BrandStoryResults` |
| `components/ImageCard.tsx` | 单图卡 | 复用 `GenerationResultTile` |
| `components/ThreadSelector.tsx` | 4 线路选择 | 新 `BrandStoryThreadSelect` |

---

## 3. 数据模型与类型扩展

### 3.1 `src/types.ts`
```ts
export type AssetKind =
  | "avatar" | "storefront" | "poster" | "product"
  | "p_signboard" | "picture_wall" | "detail_page"
  | "brand_story";    // 新增

export type BrandStoryThreadId = "thread1" | "thread2" | "thread3" | "thread4";

export interface BrandCopyDetail { title: string; content: string; }
export interface BrandCopy {
  mainSlogan: string;
  subSlogan: string;
  featureTitle: string;
  featureContent: string;
  detailsTitle: string;
  details: BrandCopyDetail[];
}
export interface BrandStoryThreadAvailabilityItem {
  available: boolean;
  name: string;
  description: string;
}
export type BrandStoryThreadAvailability = Record<BrandStoryThreadId, BrandStoryThreadAvailabilityItem>;
```

### 3.2 Supabase schema
新建迁移文件 `supabase/migrations/20260514_add_brand_story_asset_kind.sql`：
```sql
alter table public.generation_logs
  drop constraint if exists generation_logs_asset_kind_check;
alter table public.generation_logs
  add constraint generation_logs_asset_kind_check
  check (asset_kind in (
    'avatar','storefront','poster','product',
    'p_signboard','picture_wall','detail_page','brand_story'
  ));
```
同步更新：
- `supabase/schema.sql` 中的 `check` 约束
- `src/lib/supabase.ts::AssetKindDb` 与 `DailyStatRow`（新增 `brand_story_count`，若依赖统计视图也需同步）

### 3.3 Rust 端 GenerationLog（如有）
后端管理员命令若引用 asset_kind 枚举，需同步加入 `brand_story`。

---

## 4. Rust 后端实现方案

### 4.1 文件结构
```
src-tauri/src/
├── brand_story.rs              # 顶层：threads + text 生成 + Tauri 命令
├── brand_story_clients.rs      # Gemini / OpenAI 双协议客户端（仅文本）
└── bin/backend_gateway.rs      # 复用上述模块，新增 axum 路由
```

### 4.2 主要类型
```rust
// src-tauri/src/brand_story.rs
pub const BRAND_STORY_SYSTEM_PROMPT: &str = include_str!("../brand_story_prompt.md");

#[derive(Deserialize)]
pub enum BrandStoryThreadId { Thread1, Thread2, Thread3, Thread4 }

#[derive(Serialize, Deserialize)]
pub struct BrandCopy { /* 与前端类型一一对应 */ }

#[derive(Deserialize)]
pub struct BrandStoryTextRequest {
    pub store_name: String,
    pub category: String,
    pub thread_id: BrandStoryThreadId,
}

#[derive(Serialize)]
pub struct BrandStoryThreadAvailability { /* ... */ }
```

### 4.3 线路环境变量映射（保留源项目命名，复用现有）
| Thread | base_url 优先级 | text_api_key 优先级 | image_api_key（仅用于"可用性判定"） |
| --- | --- | --- | --- |
| thread1 | `BRAND_STORY_THREAD1_BASE_URL` → `API_BASE_URL` → `https://yunwu.ai` | `BRAND_STORY_THREAD1_TEXT_API_KEY` → `TEXT_API_KEY` → `IMAGE_2_API_KEY` | 同左 |
| thread2 | `BRAND_STORY_THREAD2_BASE_URL` → `https://newapi.aicohere.org/v1/chat/completions` | `BRAND_STORY_THREAD2_TEXT_API_KEY` | `BRAND_STORY_THREAD2_IMAGE_API_KEY` |
| thread3 | `BRAND_STORY_THREAD3_BASE_URL` → `https://api.vectorengine.ai` | `BRAND_STORY_THREAD3_TEXT_API_KEY` | `BRAND_STORY_THREAD3_IMAGE_API_KEY` |
| thread4 | `BRAND_STORY_THREAD4_BASE_URL` → `NEW_PICTURE_WALL_128API_BASE_URL` → `https://128api.cn/v1` | `BRAND_STORY_THREAD4_TEXT_API_KEY` → `BRAND_STORY_THREAD4_API_KEY` → `NEW_PICTURE_WALL_128API_KEY` | 同左 |

### 4.4 暴露的 Tauri / axum 端点
| 命令 / 路由 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `brand_story_generate_text` / `POST /api/brand-story-generate-text` | `BrandStoryTextRequest` | `BrandCopy` | 调用对应线路 LLM，解析 JSON |
| `brand_story_thread_availability` / `GET /api/brand-story-thread-availability` | — | `BrandStoryThreadAvailability` | 根据环境变量判定可用性（不暴露密钥本身） |

需在 `lib.rs::generate_handler!` 与 `bin/backend_gateway.rs::Router` 同时注册。

### 4.5 实现要点
- 使用 `http_client::build_api_client("brand-story")` 复用现有 reqwest 客户端（300s 超时）
- 解析 JSON 时容忍 markdown 代码块包裹
- 错误统一返回 `Result<_, String>`，与既有命令一致

---

## 5. 前端实现方案

### 5.1 业务逻辑层 `src/lib/brand-story.ts`
```ts
export const BRAND_STORY_IMAGE_CONFIGS = [
  { aspectRatio: "3:2", name: "主文案配图",  getPrompt: c => `${c.mainSlogan} ${c.subSlogan}` },
  { aspectRatio: "16:9", name: "品牌特色配图", getPrompt: c => `${c.featureTitle} ${c.featureContent}` },
  { aspectRatio: "4:3", name: "细节1配图",   getPrompt: c => c.details[0]?.content ?? "" },
  { aspectRatio: "4:3", name: "细节2配图",   getPrompt: c => c.details[1]?.content ?? "" },
  { aspectRatio: "4:3", name: "细节3配图",   getPrompt: c => c.details[2]?.content ?? "" },
] as const;

export interface BrandStoryImageEntry {
  index: number;             // 1..5
  aspectRatio: string;
  name: string;
  item: GenerationItem;      // 复用现有类型
}

export interface BrandStoryState {
  copy: BrandCopy | null;
  images: BrandStoryImageEntry[];
  textBusy: boolean;
  imageBusyIndex: number | null;
}

export async function generateBrandStoryCopy(
  storeName: string,
  category: string,
  threadId: BrandStoryThreadId
): Promise<BrandCopy>;

export async function generateBrandStoryImage(
  index: number,
  copy: BrandCopy,
  storeName: string,
  category: string,
  generationLine: GenerationLine,
  shopNameStem: string
): Promise<GenerationItem>;
```

**关键映射**：
- `aspectRatio` → `size` 字符串：3:2 / 16:9 / 4:3（线路1/3 支持比例，线路5 直接传比例值；线路2 海报回退至 `1792x768` — 由 `image_provider` 已经支持）
- prompt 模板：复用源项目 `buildBrandStoryImagePrompt(storeName, category, promptContent)` 文案
- 归档 OSS：`compressAndArchiveGenerated("brand_story", rawBase64, "<shopStem>-brand-story-<idx>")`

### 5.2 `src/lib/tauri.ts` 新增
```ts
export async function generateBrandStoryText(req: BrandStoryTextRequest): Promise<BrandCopy>;
export async function fetchBrandStoryThreadAvailability(): Promise<BrandStoryThreadAvailability>;
```
两个函数同样走「网关模式 / 直连模式」二分支（沿用现有 `getBackendGatewayUrl()` 判定）。

### 5.3 `src/lib/oss-assets.ts`
`COMPRESSION_BY_KIND` 增加 `brand_story: { maxDimension: 2048, quality: 92 }`（高清细节展示）。

### 5.4 `src/lib/history.ts` / `cloud-history.ts`
`getHistoryTitle("brand_story")` → `"品牌故事配图"`；HistoryPanel 类型徽章映射同步。

### 5.5 Hook：`src/hooks/useBrandStoryWorkspace.ts`
状态：
```ts
storeName, category, threadId;       // 输入
copy: BrandCopy | null;
images: BrandStoryImageEntry[];      // 5 张固定占位，初始 status: idle
phase: "idle" | "text" | "image" | "done";
imageProgress: number;
```
方法：
- `handleGenerate()`：先生成文案→串行生成 5 张图（失败的单张不阻塞）→每张成功后记录历史
- `handleRetryImage(index)`：单图重试
- `handleDownload()`：批量下载所有 succeeded
- `handleDownloadItem(index)`：单图下载

下载尺寸沿用模型原图尺寸（不强制缩放），同时使用 `pickSavePath` / `pickDirectoryPath` + `resizeAndSaveImage`（target_w/h 设置为模型生成原尺寸即可，无失真）。

### 5.6 UI 组件
| 组件 | 路径 | 职责 |
| --- | --- | --- |
| `BrandStoryPage.tsx` | `src/components/` | 顶层布局：`panel-stack`（左输入）+ `BrandStoryResults`（右结果） |
| `BrandStoryInputCard.tsx` | `src/components/` | 店铺名 + 品类 + ThreadSelect + 生成按钮 |
| `BrandStoryThreadSelect.tsx` | `src/components/` | 4 线路单选（与现有 `GenerationLineSelect` 视觉一致，新写一个） |
| `BrandStoryResults.tsx` | `src/components/` | 文案块 + 5 图网格 + 批量下载按钮 + MerchantCopyCard |
| `BrandStoryCopyBlock.tsx` | `src/components/` | 文案展示（点击复制各字段），用现有 toast 取代源项目内嵌弹窗 |

样式：尽可能复用 `picture-wall-page` / `panel-stack` / `result__head` / `detail-page-grid` 现有 CSS class，新增少量 `brand-story-*` 类放入 `src/styles/global.css`。

### 5.7 接入工作区
- `useGenerationWorkspace`：
  - 新增 `WorkspaceTab` 字面量 `"brandStory"`
  - 实例化 `brandStory = useBrandStoryWorkspace({...})`
  - busy 聚合、return 暴露 `brandStory`
- `WorkspaceShell`：title 映射加上 `"品牌故事"`
- `WorkspacePages`：增加 `if (workspace.tab === "brandStory")` 分支
- `Sidebar`：在 `detailPage` 之后插入：
  ```tsx
  { key: "brandStory", label: "品牌故事", icon: <IconSparkles />, desc: "店铺品牌文案 + 5 张配图" }
  ```

---

## 6. 环境变量

### 6.1 `.env.example` 追加
```env
# ---- 品牌故事文案线路 ----
BRAND_STORY_THREAD1_BASE_URL=
BRAND_STORY_THREAD1_TEXT_API_KEY=
BRAND_STORY_THREAD2_BASE_URL=https://newapi.aicohere.org/v1/chat/completions
BRAND_STORY_THREAD2_TEXT_API_KEY=
BRAND_STORY_THREAD2_IMAGE_API_KEY=
BRAND_STORY_THREAD3_BASE_URL=https://api.vectorengine.ai
BRAND_STORY_THREAD3_TEXT_API_KEY=
BRAND_STORY_THREAD3_IMAGE_API_KEY=
BRAND_STORY_THREAD4_BASE_URL=https://128api.cn/v1
BRAND_STORY_THREAD4_API_KEY=
NEW_PICTURE_WALL_128API_KEY=
```
> 直连模式下密钥在 `.env.local`；网关模式下放在服务器侧。

### 6.2 `docs/backend-gateway-deploy.md`
在 "后端服务器环境变量" 段落补充上述四组变量。

---

## 7. 测试与验证

### 7.1 静态校验
1. `npx tsc -b` 通过（前端类型）
2. `cargo check --features tauri-commands`（Tauri 端）
3. `cargo check --bin backend-gateway`（云端网关）

### 7.2 单元测试（沿用 tests/*.test.ts 风格）
- `tests/brand-story-clients.test.ts`：验证 Gemini / OpenAI 请求体构造、响应解析（仿源项目 `brand-story-clients.test.mjs` 改写为 TS）
- `tests/brand-story-threads.test.ts`：4 线路环境变量解析与可用性 fallback
- `tests/brand-story-flow.test.ts`：mock generateImage / generateBrandStoryText，串行 5 张图含失败容错

### 7.3 手动联调
1. 配置 `.env.local` 中至少 thread1 与 line5 的密钥
2. `npm run tauri:dev`
3. 侧边栏 → 「品牌故事」→ 输入「阿牛黄焖鸡米饭」+「黄焖鸡米饭」→ 选线路 1
4. 等待文案返回 → 5 张图按 3:2 / 16:9 / 4:3×3 顺序出现
5. 单图下载 / 批量下载 / 重试失败图 → 全部成功
6. 切换历史记录页 → 应看到 5 条 `brand_story` 记录

---

## 8. 执行顺序（与 Task 列表一一对应）

| 步骤 | 任务 | 主要交付物 |
| --- | --- | --- |
| 1 | 编写本计划 | 当前文档 |
| 2 | Rust 后端 | `src-tauri/src/brand_story.rs`、`brand_story_clients.rs`、`brand_story_prompt.md`、`lib.rs` 与 `bin/backend_gateway.rs` 注册 |
| 3 | 类型与数据基础设施 | `types.ts`、`tauri.ts`、`oss-assets.ts`、`history.ts`、`supabase.ts`、`supabase/migrations/20260514_*.sql` |
| 4 | 业务逻辑层 | `src/lib/brand-story.ts` + `brand-story-download.ts` |
| 5 | Workspace hook | `src/hooks/useBrandStoryWorkspace.ts` |
| 6 | UI 组件 | 5 个 `src/components/BrandStory*.tsx` + 样式 |
| 7 | 接入侧边栏 / 主壳 | `useGenerationWorkspace.ts`、`WorkspaceShell.tsx`、`WorkspacePages.tsx`、`Sidebar.tsx`、`HistoryPanel.tsx` |
| 8 | 文档与环境变量 | `.env.example`、`docs/backend-gateway-deploy.md`、`README.md` |
| 9 | 构建验证 | TS + Cargo check 全绿 |

---

## 9. 风险与决策记录

| 风险 | 决策 |
| --- | --- |
| 图片改走 image-2（gpt-image-2-all）而非 Gemini，是否仍能呈现"品牌故事"风格的高质感美食图 | 已和现有详情页等工具同链路，由 prompt 描述决定风格；用户已明确要求 |
| `aspectRatio` 字符串差异（gpt-image-2 支持 3:2/16:9/4:3） | 沿用现有 `image_provider` 的 size 解析（线路1/3/5 均接收比例值） |
| 文案 API Key 与 image-2 现有 Key 是否复用 | thread1 默认 fallback 至 `IMAGE_2_API_KEY`；thread4 fallback 至 `NEW_PICTURE_WALL_128API_KEY`，不强制新增 |
| Supabase 约束变更需要 admin 在生产库执行 | 提供 SQL 迁移文件 + README 提示 |
| 5 张图串行耗时较长 | 沿用源项目串行策略，单张失败不阻塞，UI 显示进度 1/5 … 5/5 |
| `prompt.md` 嵌入 Rust 后内容更新需重新编译 | 业务可接受，文案 prompt 改动频率低；如频繁更新改为运行时读取 `src-tauri/resources/` |

---

## 10. 完成判定（DoD）
- [ ] 侧边栏出现「品牌故事」入口（在「详情页生成」下方）
- [ ] 表单可输入店铺名 / 品类，单选 4 条线路（线路可用性自动判定）
- [ ] 点击生成后顺序产出文案 + 5 张图，OSS URL 写入 Supabase
- [ ] 失败单图可单独重试；可单图下载 / 批量下载
- [ ] 历史记录页可查到 `brand_story` 类型记录并可预览
- [ ] tsc + cargo check 全部通过
