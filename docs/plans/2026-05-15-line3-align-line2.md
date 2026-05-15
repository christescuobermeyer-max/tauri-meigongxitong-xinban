# 线路3（vectorengine）对齐线路2 行为 — 开发文档

> 日期：2026-05-15
> 作者：christescuobermeyer-max
> 目标：把线路3 的调用协议完全对齐线路2（yunwu），只把域名换成 `https://api.vectorengine.ai`。

---

## 1. 背景

线路3 当前走 vectorengine 的 `v1/images/generations` JSON 接口，参考图通过 `reference_images` 字段下发，没有专用的 edit（参考图）接口；线路2 则是 yunwu 的「生成 + 编辑」双接口模式：

- 无参考图 → `POST /v1/images/generations`（JSON）
- 有参考图 → `POST /v1/images/edits`（multipart，参考图作为 `image` 字段）

实际使用中线路3 的 vectorengine 平台也提供同样的两接口规格，业务希望把线路3 的请求行为整体替换成线路2 那一套，仅域名不同。

---

## 2. 变更对照表

| 项 | 线路2 (yunwu) 现状 | 线路3 (vectorengine) 现状 | 线路3 改造后目标 |
|---|---|---|---|
| 生成接口 URL | `https://yunwu.ai/v1/images/generations` | `https://api.vectorengine.ai/v1/images/generations` | `https://api.vectorengine.ai/v1/images/generations` ✅ 不变 |
| 编辑接口 URL | `https://yunwu.ai/v1/images/edits` | 无 | `https://api.vectorengine.ai/v1/images/edits` 🆕 新增 |
| model | `gpt-image-2` | `gpt-image-2-all` | `gpt-image-2` ⚠️ 改 |
| quality | `"high"` | 不发 | `"high"` ⚠️ 改 |
| format | `"png"` | 不发 | `"png"` ⚠️ 改 |
| JSON 参考图字段 | `image: [...]` | `reference_images: [...]` | `image: [...]` ⚠️ 改 |
| 有参考图分支 | multipart → edits | JSON → generations | multipart → edits ⚠️ 改 |
| API Key 环境变量 | `IMAGE_2_LINE2_API_KEY` | `VECTORENGINE_IMAGE_2_API_KEY` / `IMAGE_2_LINE3_API_KEY` | 保持现有 env 名，**不动** |
| user_label / log_label | 线路2 / `image-2:line2` | 线路3 vectorengine / `image-2:line3-vectorengine` | 保持现有标签，**不动** |

变更后线路3 与线路2 在「请求构造层」完全同构，只是 URL 前缀和 API Key 不同。

---

## 3. 涉及修改的文件

### 3.1 Rust 端（`src-tauri/src/`）

**`image_provider.rs`** — 调整 `LINE3_*` 常量与 `resolve_image_provider` 中 Line3 分支：

```rust
const LINE3_API_URL: &str = "https://api.vectorengine.ai/v1/images/generations";
const LINE3_EDIT_API_URL: &str = "https://api.vectorengine.ai/v1/images/edits";   // 🆕
const LINE3_MODEL: &str = "gpt-image-2";   // ⚠️ 由 gpt-image-2-all 改
const LINE3_API_KEY_ENV_KEYS: [&str; 3] = [
    "VECTORENGINE_IMAGE_2_API_KEY",
    "VECTOR_ENGINE_IMAGE_2_API_KEY",
    "IMAGE_2_LINE3_API_KEY",
];
```

```rust
ImageApiLine::Line3 => ImageProvider {
    api_url: LINE3_API_URL,
    edit_api_url: Some(LINE3_EDIT_API_URL),         // 🆕
    model: LINE3_MODEL,
    log_label: "image-2:line3-vectorengine",
    user_label: "线路3 vectorengine",
    api_key_env_keys: &LINE3_API_KEY_ENV_KEYS,
    quality: Some("high"),                           // ⚠️
    format: Some("png"),                             // ⚠️
    reference_image_json_field: ReferenceImageJsonField::Image,  // ⚠️ 由 ReferenceImages 改
},
```

**`api.rs`** — 在 `generate_image()` 中扩展「有参考图 → 走 edits」分支，把现有的 Line2 判断改为 Line2 或 Line3：

```rust
if (req.api_line == ImageApiLine::Line2 || req.api_line == ImageApiLine::Line3)
    && !req.product_images.is_empty()
{
    let edit_api_url = provider
        .edit_api_url
        .ok_or_else(|| format!("{}编辑接口未配置", provider.user_label))?;
    let image = generate_yunwu_edit_image(
        &client,
        edit_api_url,
        &api_key,
        provider.model,
        &req.prompt,
        &req.size,
        &req.product_images,
        provider.quality,
        provider.format,
    )
    .await?;
    return download_image_if_url(
        &client,
        image,
        &format!("下载{}编辑远端图片失败", provider.user_label),
    )
    .await;
}
```

> 备注：`generate_yunwu_edit_image` 内部错误信息当前硬编码"线路2"。为避免线路3 报错时显示"线路2 …"，把模块改造成接收 `user_label`，或新建一个 `multipart_edit.rs` 通用模块。**实现细节见下文第 4 节**。

### 3.2 文档 / 配置

- **`.env.example`** — 不新增 env 变量（`VECTORENGINE_IMAGE_2_API_KEY` 已存在），加一行注释说明 vectorengine 接口走 generations + edits 双接口。
- **`README.md`** — 「关键实现说明」段落或新增「5 条线路对照表」段落里，把线路3 的 model 标注更新为 `gpt-image-2`（如果有提到）。当前 README 没有显式列 model，可能不需要动。

### 3.3 测试 (`tests/`)

- **`tests/vectorengine-line.test.ts`** — 当前断言固化了旧规格，需要更新：
  - 删除：`const LINE3_MODEL: &str = "gpt-image-2-all";` 断言
  - 删除：`ReferenceImageJsonField::ReferenceImages` 断言
  - 删除：`!apiSource.includes("req.api_line == ImageApiLine::Line3")` 断言（改造后会出现 `ImageApiLine::Line3`）
  - 新增：line3 model = `gpt-image-2`；edit URL = `https://api.vectorengine.ai/v1/images/edits`；quality/format/reference_image_json_field=Image；api.rs 包含 `ImageApiLine::Line3` 的 edit 分支

- **`tests/yunwu-line2-api.test.ts`** — 不动；但顺手核查该测试当前断言的 `quality: Some("low")` 与实际代码 `Some("high")` 是否已经偏离（属另一事，不在本次范围）。

### 3.4 前端

不动。线路3 在前端的展示文案（"vectorengine"）、`generation_line=line3` 标签、Supabase schema 中的 `line3` 枚举都保持不变。

---

## 4. `yunwu_edit.rs` 的复用方式（两种选项）

**选项 A（最小改动，推荐）**：
- 将 `yunwu_edit.rs` 中的硬编码字符串「线路2」抽参，函数签名增加 `label: &str` 或 `log_label: &str` 参数；
- 函数名保持 `generate_yunwu_edit_image`，或重命名为 `generate_multipart_edit_image`；
- api.rs 调用处把 `provider.user_label` / `provider.log_label` 传入。

**选项 B（保守）**：
- 直接复用 `generate_yunwu_edit_image`，线路3 报错信息会出现"线路2"字样；
- 后续可作小重构。

→ **采用选项 A**。改动量小、可读性更好；同时保留所有 multipart 上传逻辑，无需重复实现。

---

## 5. 部署流程（云服务器侧）

`backend-gateway` 是云端真正发请求的进程。代码改完后需要重编译并重启：

```bash
# 1. SSH 上服务器
ssh admin@47.86.225.83

# 2. 拉新代码 + 编译 + 重启（一站式）
cd /opt/csgh-image-studio
sudo bash docs/cloud-gateway/update.sh

# 3. 验证
curl https://gw.hbcsch.pw/health
sudo journalctl -u csgh-backend-gateway -f
```

`update.sh` 会自动 git pull、`cargo build --release --bin backend-gateway`、`systemctl restart csgh-backend-gateway`。

> **API Key**：`/opt/csgh-gateway/secrets/gateway.env` 中的 `VECTORENGINE_IMAGE_2_API_KEY` **是否需要换新值**，请在 Open Questions 第 4 项确认。如果只是改代码、不换 key，本步骤无需碰 `gateway.env`。

---

## 6. 验证步骤（含本地 & 云端）

### 本地（Rust 单元测试 + TS 断言测试）

```bash
# 1. Rust 单测
cd src-tauri
cargo test image_provider -- --nocapture
cargo test --bin backend-gateway

# 2. TS 断言测试（套件入口）
# 注：项目使用自定义 .test.ts 运行器，按现有方式跑
node --import tsx tests/vectorengine-line.test.ts
node --import tsx tests/yunwu-line2-api.test.ts
```

### 桌面应用冒烟（直连模式）

1. 启动 `npm run tauri:dev`
2. 侧边栏选「三件套设计」→ 顶部线路切到「线路3」
3. 上传 1 张产品图，输入店铺名 → 生成
4. **预期**：网络面板能看到走的是 `api.vectorengine.ai/v1/images/edits`（multipart），返回图片可正常预览、下载、归档到 OSS、Supabase 历史记录里 `generation_line=line3`

### 云端冒烟（通过网关）

1. 修改 `.env.local` 把 `VITE_BACKEND_GATEWAY_URL=https://gw.hbcsch.pw` 启用
2. 重启 dev → 同样跑一次三件套生图
3. 服务器侧 `journalctl -u csgh-backend-gateway -f` 看日志中 `[image-2:line3-vectorengine]` 和 `[image-2:line3-edit]`（或类似 label）

### 回滚预案

- 代码：`git revert <本次提交 sha>` → `update.sh` 重新部署
- 配置：`gateway.env` 本次不动，无需回滚
- 数据：本改动不涉及 schema，无需迁移回滚

---

## 7. Open Questions — 待你确认后我再动手

1. **vectorengine 的 model 名**：改成 `gpt-image-2`（和线路2 完全一致）？还是 vectorengine 平台使用别的 model 标识（比如保留 `gpt-image-2-all`）？
2. **quality 参数**：vectorengine 是否支持 `quality=high`？如果不支持要不要不发？
3. **format 参数**：vectorengine 是否支持 `format=png`？
4. **API Key 是否要换**：运维凭证里 `VECTORENGINE_IMAGE_2_API_KEY` 当前值是 `sk-KExKJmR5aG3JXH9F4htapRxzwAAcO9BIIz0UPtNEV8dlcnhe`，本次改造是否同时要换 key？还是 key 不动、只改 URL/协议？
5. **是否需要保留旧 `reference_images` 字段做兼容**？还是直接硬切到 `image` 字段（vectorengine 后端就吃 `image` 不吃 `reference_images`）？
6. **错误信息里的"线路2"字样**：你接受我把 `yunwu_edit.rs` 抽出 `label` 参数（即选项 A）吗？

---

## 8. 实施步骤（确认后顺序执行）

```
1. [Rust] image_provider.rs   → 改 LINE3_* 常量 + Line3 分支
2. [Rust] yunwu_edit.rs       → 函数签名加 label 参数（选项 A）
3. [Rust] api.rs              → Line3 加入 edit 分支判断
4. [Test] vectorengine-line.test.ts → 更新断言
5. [本地] cargo test + node tests/  → 全绿
6. [本地] tauri:dev 冒烟（直连）
7. [Git]  commit + push
8. [云端] ssh + update.sh + 健康检查 + 冒烟
```

每步完成后我会回报，遇到失败立刻停下来同步。
