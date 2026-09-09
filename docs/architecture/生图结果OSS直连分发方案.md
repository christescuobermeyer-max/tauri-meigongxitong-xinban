# 生图结果 OSS 直连分发方案

> 制定日期：2026-08-05  
> 适用范围：呈尚策划美工生图系统 PRO、Rust/Axum 云端网关、阿里云 OSS  
> 目标服务器：椰子云 `156.225.23.248`  
> 状态：已完成生产实施（2026-08-05）

## 1. 背景与目标

当前生产网关在一次成功生图中会同时完成两件事：

1. 将生成结果压缩并归档到阿里云 OSS。
2. 将上游返回的完整 Base64 再放进 JSON 响应发给客户端。

第二步形成了重复分发。Base64 相比原始二进制约增加 33% 体积，多账号并发时会让云服务器公网出口长时间维持高占用，触发云平台智能限速。服务器即使标称 20 Mbps，也可能在持续大流量后被动态限制。

本方案的目标是：

- 新版客户端的生成结果直接从 OSS 下载，不再由 `gw.hbcsch.pw` 承载大图片响应。
- 旧版客户端无需升级即可继续运行。
- OSS 归档失败时不丢失已经生成的图片。
- 客户端拿到 OSS 图片后继续使用现有 Base64 状态、预览、复制和导出逻辑。
- 归档图达到正式交付所需分辨率，不因链路调整降低清晰度。
- 网关与客户端可以分别回滚，不要求同一时刻完成切换。

本次不改变生图上游、Supabase Auth、历史表结构和 OSS 密钥管理。上游 API Key 与 OSS AccessKey 仍只保存在服务器。

## 2. 当前链路与目标链路

### 2.1 当前链路

```text
Tauri 客户端
  -> HTTPS 请求 gw.hbcsch.pw
  -> 网关调用 image-2 上游
  -> 网关取得完整生成图 Base64
  -> 网关压缩图片并上传 OSS
  -> 网关返回 archive_url + 完整 image Base64
  -> 客户端从网关接收数 MB 至十几 MB JSON
```

网关同时承担“控制面”和“图片分发面”。并发增加后，响应图片会长期占用服务器公网出口。

### 2.2 目标链路

```text
Tauri 客户端
  -> HTTPS 请求 gw.hbcsch.pw
  -> 网关调用 image-2 上游
  -> 网关压缩为可交付图并上传 OSS
  -> 网关返回 image_url、archive_url、archive_key 等短 JSON
  -> Tauri 客户端直接 GET 阿里云 OSS 签名 URL
  -> 客户端本地转换为 Base64
  -> 原有预览、复制、缩放、下载逻辑继续工作
```

目标链路中，网关继续负责认证、线路调度、限流、重试、归档和历史记录，但不再作为新版客户端的正常图片下载代理。

## 3. 协议设计

### 3.1 请求协商字段

`POST /api/generate-image` 增加可选字段：

```json
{
  "prompt": "...",
  "size": "1024x1024",
  "product_images": [],
  "result_delivery": "oss_url",
  "archive": {
    "asset_kind": "avatar",
    "file_name_stem": "示例店-avatar",
    "shop_name": "示例店",
    "platform": "meituan"
  }
}
```

`result_delivery` 取值：

| 值 | 行为 |
|---|---|
| 未传或 `inline_base64` | 兼容旧客户端，响应继续携带完整 `image` Base64 |
| `oss_url` | 新客户端模式；归档成功时仅返回 OSS URL，不返回完整 Base64 |

当 `result_delivery = "oss_url"` 时，`archive` 必填。网关必须在调用上游前校验；缺失时返回 HTTP 400，避免产生一张无法交付的图片。

未知的 `result_delivery` 值由 Serde 拒绝并返回 HTTP 422/400，不静默降级，防止客户端拼写错误后误以为已经启用直连。

### 3.2 URL 模式成功响应

```json
{
  "image": null,
  "image_url": "https://<oss-host>/generated/<object>?<signature>",
  "result_delivery": "oss_url",
  "generation_line": "line2",
  "archive_url": "https://<oss-host>/generated/<object>?<signature>",
  "archive_key": "generated/<object>",
  "archive_error": null,
  "history_recorded": true,
  "history_error": null
}
```

说明：

- `image_url` 是本次结果交付地址。
- `archive_url` 保留原有语义，供历史记录与现有代码兼容。
- 两个 URL 当前指向同一对象，但客户端应优先读取 `image_url`。
- `image` 明确为 `null`，避免空字符串被误当作合法图片。
- 文档、日志和测试不得记录完整签名 URL。

### 3.3 归档失败回退响应

```json
{
  "image": "<base64>",
  "image_url": null,
  "result_delivery": "inline_base64",
  "generation_line": "line2",
  "archive_url": null,
  "archive_key": null,
  "archive_error": "<sanitized error>",
  "history_recorded": null,
  "history_error": null
}
```

上游已经成功但 OSS 压缩或上传失败时，网关必须返回内联 Base64。客户端仍可展示和导出结果，只是该次结果不能进入云端历史。不能为了节省流量丢弃已经付费生成的图片。

### 3.4 兼容矩阵

| 客户端 | 网关 | 实际行为 | 是否可用 |
|---|---|---|---|
| 旧版 | 旧版 | 内联 Base64 | 是 |
| 旧版 | 新版 | 未传协商字段，仍返回内联 Base64 | 是 |
| 新版 | 旧版 | 旧网关忽略新字段并返回 Base64，新客户端兼容读取 | 是 |
| 新版 | 新版 | OSS URL 直连；归档失败自动回退 Base64 | 是 |

这张矩阵是发布顺序和回滚安全的核心，任何实现不得破坏其中任一组合。

## 4. 客户端实现

### 4.1 统一入口

所有生产生图工作区都通过 `src/lib/tauri.ts` 的 `generateArchivedImageWithLine` 调用网关。直连逻辑集中在该函数内：

1. 请求自动增加 `result_delivery: "oss_url"`。
2. 若响应 `image` 有值，直接使用，兼容旧网关和失败回退。
3. 若 `image` 为空，读取 `image_url`，其次兼容读取 `archive_url`。
4. 客户端直接 GET OSS URL，不能改为 GET `gw.hbcsch.pw`。
5. 下载完成后转换为 Base64，继续返回既有 `image` 字段。
6. 工作区继续维护 `rawBase64` 和 `rawDataUrl`，复制、编辑、缩放和本地导出不改数据模型。

这样头像、店招、海报、产品图、图片墙、详情页、品牌故事、P 门头和数据分析无需分别实现网络分发逻辑。

### 4.2 下载稳定性

客户端下载 OSS 必须具备：

- 单次 45 秒超时。
- 最多 3 次尝试，重试间隔递增。
- HTTP 非 2xx、空响应、非图片 Content-Type 均视为失败。
- 数组分块转 Base64，避免一次 `apply` 大数组导致栈溢出。
- 错误信息只显示 HTTP 状态和尝试次数，不输出完整签名 URL。

签名 URL 当前有效期为 7 天，新生成结果会立即下载，不依赖长期有效性。历史记录保留期不得超过签名 URL 可用期；若未来延长历史保留，应另行实现按 `archive_key` 刷新签名 URL。

### 4.3 OSS CORS

Windows Tauri WebView 直接 `fetch` OSS 时，Bucket CORS 至少要允许应用源执行 `GET`、`HEAD`。当前历史下载已有 OSS `fetch` 路径，部署前仍需用生产客户端验证响应包含合适的 `Access-Control-Allow-Origin`。

建议规则：

- Allowed Methods：`GET`、`HEAD`
- Allowed Headers：`*`
- Expose Headers：`Content-Type`、`Content-Length`、`ETag`
- Allowed Origins：生产 Tauri 源；本地开发源单独列出
- 不使用 Cookie，不开启 credentials

若当前 Bucket 使用 `*` 且签名 URL 仅授予单对象短期 GET，可继续使用；不得因此把 Bucket 改为公共读。

## 5. 画质与对象规格

原有 OSS 图主要用于历史预览，部分规格低于正式导出尺寸。直连后 OSS 图成为客户端的正式输入，必须调整尺寸下限。

| 类型 | 当前最长边 | 新最长边 | JPEG 质量 | 依据 |
|---|---:|---:|---:|---|
| 头像 | 768 | 1024 | 90 | 最终导出 `800x800`，禁止从 768 放大 |
| 店招 | 1536 | 1536 | 90 | 最终宽度不超过 750，已有余量 |
| 海报 | 1536 | 2048 | 92 | 淘宝闪购最终宽度为 2048 |
| P 门头 | 1536 | 1792 | 92 | 最终导出 `1792x1024` |
| 产品图 | 1024 | 1024 | 90 | 最终导出 600 宽，已有余量 |
| 图片墙 | 1024 | 1536 | 92 | 高清图最终为 `1086x1448` |
| 详情页 | 2048 | 2048 | 92 | 最终为 `1024x1536`，保持现状 |
| 品牌故事 | 1792 | 1792 | 90 | 主要导出最长边 1536，保持现状 |
| 数据分析 | 1792 | 1792 | 90 | 最终为 `1536x1024`，保持现状 |

`image::resize` 只在原图超过最大边时缩小，不会把较小上游结果放大。最终平台尺寸仍由客户端现有 Lanczos3 导出逻辑处理。

## 6. 安全边界

- OSS AccessKey、Secret 和 Bucket 配置继续只存在于服务器密钥文件。
- 客户端只得到单对象、只读、有限期签名 URL。
- 网关认证、账号停用检查、并发限制和线路调度保持不变。
- 不将签名 URL 查询参数写入日志、文档、测试快照或错误上报。
- `archive_key` 只用于对象定位，不授予访问权限。
- Bucket 继续保持私有读，不能为了处理 CORS 改成公共读。
- URL 下载不得接受由用户任意提供的代理目标，避免形成 SSRF 或开放代理。

## 7. 异常处理

| 故障 | 网关行为 | 客户端行为 | 用户结果 |
|---|---|---|---|
| 上游生图失败 | 按现有多线路重试 | 显示现有失败信息 | 不产生结果 |
| OSS 压缩失败 | 返回内联 Base64 + `archive_error` | 正常展示和导出 | 本地可用，云历史缺失 |
| OSS 上传失败 | 返回内联 Base64 + `archive_error` | 正常展示和导出 | 本地可用，云历史缺失 |
| Supabase 历史写入失败 | URL 仍正常返回 + `history_error` | 正常展示和导出 | 图片可用，历史记录缺失 |
| OSS 首次下载超时 | 已归档，不再重跑上游 | 客户端重试下载 | 通常自动恢复 |
| OSS 连续 3 次下载失败 | 网关无重复生图 | 显示明确错误，可从历史重试 | 不重复扣生图费用 |
| 新客户端连接旧网关 | 旧网关返回 Base64 | 直接消费内联结果 | 正常运行但暂不省流量 |

客户端下载失败时不能自动重新调用生图接口，因为图片已经生成且已计费。后续恢复动作应重新下载同一 `archive_url`，而不是重新生成。

## 8. 发布与部署顺序

### 8.1 本地验证

1. 新增协议和客户端下载测试。
2. 运行相关 `tsx` 测试。
3. 运行 `npm run build`。
4. 运行 Rust 单元测试与网关编译。
5. 运行 `npm run tauri:build`，验证 Windows 安装包。

### 8.2 生产网关部署

生产 `/opt/csgh-image-studio` 当前不是 Git 仓库，不能执行 `git pull`。采用以下流程：

1. SSH 核对主机名、服务状态和磁盘空间。
2. 将本次涉及的 Rust 源码上传到服务器临时目录。
3. 与生产源码做校验和/差异核对，只同步本次确认的文件。
4. 以 `csgh` 用户在 `/opt/csgh-image-studio/src-tauri` 编译 release 网关。
5. 先备份当前运行二进制，备份名带时间戳。
6. 使用 `install` 原子替换 `/opt/csgh-gateway/bin/backend-gateway`。
7. 重启 `csgh-backend-gateway`，检查本机和公网健康接口。
8. 先用旧请求验证仍返回 `image`，再用 URL 请求验证 `image = null`。

网关先部署不会改变旧客户端行为，可以独立上线。

### 8.3 客户端发布

1. 按 `docs/自动更新.md` 核对生产 Supabase 项目标识。
2. 递增版本号并构建 MSI/NSIS。
3. 上传安装包和更新元数据。
4. 先在一台测试电脑灰度，验证登录、生图、预览、复制、单图下载和批量下载。
5. 确认网关响应流量下降后，再扩大更新范围。

## 9. 验收标准

### 9.1 协议验收

- 不传 `result_delivery` 的请求仍返回非空 `image`。
- 传 `oss_url` 且归档成功时，`image` 为 `null`，`image_url` 和 `archive_key` 非空。
- 传 `oss_url` 但不传 `archive` 时，在调用上游前返回 400。
- 模拟 OSS 失败时，响应自动切回 `inline_base64` 且 `image` 非空。

### 9.2 功能验收

- 头像、店招、海报、产品图、P 门头、图片墙、详情页、品牌故事和数据分析至少各验证一次。
- 生成后预览正常，图片复制正常。
- 单图下载、批量下载、历史下载正常。
- 导出尺寸与改造前一致，头像、淘宝海报、P 门头和图片墙不从低分辨率归档图放大。
- 旧版客户端连接新网关仍可正常生图。

### 9.3 网络与服务验收

- URL 模式 `/api/generate-image` 响应体应从数 MB 降到 KB 级。
- Caddy 日志中的该响应字节数显著下降。
- 图片 GET 的远端主机为 OSS 域名，不是 `gw.hbcsch.pw`。
- 网关、Caddy 均为 `active`，日志无持续 5xx、归档错误或 panic。
- 并发配置继续保持生产设定，不因本次发布被示例默认值覆盖。

## 10. 监控与长期治理

建议持续观察：

- 网关 `/api/generate-image` 响应字节分布。
- `archive_error`、`history_error` 和客户端 OSS 下载失败率。
- 服务器公网带宽、CPU、内存和归档队列等待。
- OSS 外网下行流量及费用。
- 各图片类型归档后实际字节数。

带宽治理原则：

- 控制面走网关，静态大对象走 OSS。
- 不在网关日志打印 Base64 或完整签名 URL。
- 不通过提高网关并发掩盖上游或带宽瓶颈。
- 并发上限与带宽监控联动；若平台仍因“持续占用”限速，再增加客户端请求节流或调整 OSS 图片质量，而不是恢复网关内联分发。

## 11. 回滚方案

### 11.1 仅回滚网关

恢复备份二进制并重启服务。新版客户端连接旧协议时会读取内联 Base64，功能不受影响，只是暂时恢复较高网关流量。

### 11.2 仅回滚客户端

旧客户端连接兼容网关时不传 `result_delivery`，网关自动使用 `inline_base64`，功能不受影响。

### 11.3 紧急止损

若 OSS CORS 或下载稳定性异常，可先停止客户端灰度，不需要回滚网关。已经安装的新版客户端仍可通过新网关的归档失败回退和旧网关兼容逻辑运行；必要时再恢复上一版网关二进制。

回滚后必须重新检查：

```bash
sudo systemctl is-active csgh-backend-gateway
curl -fsS http://127.0.0.1:8787/health
curl -fsS https://gw.hbcsch.pw/health
```

## 12. 完成定义

只有同时满足以下条件，本方案才算完成：

1. 正式文档、测试、客户端和网关代码一致。
2. 本地前端、Rust 和 Tauri 构建通过。
3. 兼容网关已部署到生产服务器并完成旧协议验收。
4. 新协议真实生图可从 OSS 直连取得结果。
5. 至少一台新版客户端灰度成功。
6. 已保留可执行的网关二进制和客户端版本回滚点。

## 13. 生产实施记录

### 13.1 云端网关

- 兼容网关已部署到椰子云正式服务 `csgh-backend-gateway`，正式监听端口为 `8787`。
- 临时灰度端口 `8788` 已排空并停止，Caddy 已恢复反代到 `127.0.0.1:8787`。
- 正式网关二进制 SHA-256 为 `2e57ace2fdf8c452bf472d3b994accfe1cd29da06d6a56f5c8f8db632b295b45`。
- 上一版网关备份为 `/opt/csgh-gateway/bin/backend-gateway.bak-oss-direct-20260805-130856`。
- Caddy 切回正式端口前的配置备份为 `/etc/caddy/Caddyfile.bak-oss-direct-return-20260805-130922`。
- `csgh-backend-gateway` 与 Caddy 均为 `active`，网关部署后重启次数为 `0`，本机和公网 `/health` 均通过。
- 旧请求继续返回内联 Base64；新版请求归档成功时返回短 JSON 和 OSS URL，归档失败仍自动回退 Base64。
- 当前生产并发配置为：全局 `28`、账号 `5`、线路 2/3/7 各 `6`；本次调整不改变其它线路的既有值。

### 13.2 客户端发布

- 桌面端版本为 `3.0.15`，NSIS 与 MSI 已上传到 OSS 的独立版本目录 `app-updates/3.0.15/`。
- NSIS SHA-256：`cc6a0ca722fc99b26febbcada6fa2e489b38cfc5832f32affde77396471010cc`。
- MSI SHA-256：`198fd3a06d5d64e31a54982713c50418522e69fe7d658131d7136d5bcfb459e8`。
- 本机已从 `3.0.14` 安装到 `3.0.15`，版本显示、生产登录态和启动均正常。
- “OSS直连灰度测试”真实生图命中线路 2，网关成功写入 OSS，图片 HTTP `206`、CORS `*`，客户端预览及本地下载成功。
- Supabase 更新配置已在灰度通过后启用为 `latest_version=3.0.15`、`force_update=true`，公开安装包下载验证正常。

### 13.3 当前回滚点

- 若客户端发布异常，先将 `force_update` 关闭，阻止更多旧客户端升级。
- 若网关异常，恢复上述网关备份二进制并重启；新版客户端可兼容旧网关的内联 Base64 响应。
- 若 OSS 下载异常，已经生成的归档记录仍保留，可在恢复 OSS 后重新下载，不得自动重复调用生图上游。
