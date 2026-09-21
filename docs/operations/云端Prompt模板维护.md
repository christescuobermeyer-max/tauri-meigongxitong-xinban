# 云端 Prompt 模板维护

本文档说明“呈尚策划美工生图系统 PRO”的 prompt 模板云端化方案。目标是：客户端只传模板 key 和业务变量，生产网关在服务器读取模板并渲染最终 prompt。以后调整生图提示词时，优先修改服务器模板文件并重启网关，不再为纯 prompt 调整重新构建员工客户端安装包。

## 1. 当前架构

### 生产网关模式

1. 前端工作区仍收集店铺名、平台、产品名、参考图、修改要求等业务输入。
2. 客户端请求 `/api/generate-image` 时同时携带：
   - `prompt_config.key`：模板标识，例如 `product.single`、`image_edit`。
   - `prompt_config.variables`：模板变量，例如 `shopName`、`productName`、`platform`。
   - `prompt`：本地内置 prompt，仅作为旧网关或本地直连兜底。
3. 云网关优先读取服务器模板并渲染最终 prompt。
4. 网关把渲染后的 prompt 发送给对应 image-2 上游线路。

### 兼容兜底

- 老客户端：仍只传 `prompt`，新网关继续兼容。
- 本地直连模式：未配置 `VITE_BACKEND_GATEWAY_URL` 时，客户端继续使用本地内置 prompt。
- 模板缺失或变量缺失：网关返回明确错误，避免静默使用错误 prompt。

## 2. 文件位置

| 位置 | 用途 |
|---|---|
| `prompt-templates/generation-prompts.json` | 仓库内的模板源文件，用于开发、测试和部署同步 |
| `/opt/csgh-gateway/prompts/generation-prompts.json` | 生产服务器实际读取的模板文件 |
| `src/lib/prompt-config.ts` | 客户端把不同工作区输入转换成 `prompt_config` |
| `src-tauri/src/prompt_templates.rs` | 网关读取 JSON、补充派生变量并渲染模板 |
| `docs/cloud-gateway/update.sh` | 发布网关时同步模板文件到生产路径 |
| `docs/cloud-gateway/gateway.env.example` | `PROMPT_TEMPLATE_PATH` 配置示例 |

## 3. 模板 key

| key | 对应功能 |
|---|---|
| `avatar.image` | 三件套头像：参考图模式 |
| `avatar.category` | 三件套头像：品类模式 |
| `storefront` | 三件套店招 |
| `poster` | 三件套海报 |
| `product.single` | 制作 1 张设计图 |
| `product.batch` | 制作全店图 |
| `package.image` | 制作套餐图 |
| `picture_wall` | 图片墙生成 |
| `detail_page` | 详情页生成 |
| `p_signboard` | P 门头文字替换 |
| `data_analysis` | 数据分析图 |
| `brand_story.image` | 品牌故事配图 |
| `brand_story.system` | 品牌故事文案分析 system prompt |
| `image_edit` | 修改图片 |
| `menu.organize` | 菜单文字与截图整理（仅云端） |
| `menu.image` | 菜单设计生图（仅云端） |

## 4. 修改 prompt 流程

### 只改生产 prompt

适用于纯文案调整，不改变量、不改客户端 UI、不新增模板 key。

```bash
sudo cp /opt/csgh-gateway/prompts/generation-prompts.json /opt/csgh-gateway/prompts/generation-prompts.json.bak.$(date +%Y%m%d%H%M%S)
sudo nano /opt/csgh-gateway/prompts/generation-prompts.json
jq empty /opt/csgh-gateway/prompts/generation-prompts.json
sudo systemctl restart csgh-backend-gateway
curl http://127.0.0.1:8787/health
curl https://gw.hbcsch.pw/health
```

确认健康检查正常后，员工端下一次生图会使用新 prompt。无需重新构建本地安装包。

### 改模板变量或新增功能

以下情况仍需要发新版客户端或网关：

- 新增模板 key。
- 新增客户端需要传递的变量。
- 调整上传图片数量、参考图顺序、尺寸、归档逻辑或 UI。
- 修改本地直连兜底 prompt。

这类变更应先改仓库内 `prompt-templates/generation-prompts.json` 和相关代码，再部署网关；若涉及客户端字段，发布新客户端自动更新。

## 5. 模板写法

模板使用 `{{变量名}}` 占位符。变量来自客户端 `prompt_config.variables`，网关会额外补充部分派生变量。

常用变量：

| 变量 | 含义 |
|---|---|
| `{{shop}}` | 店铺名，兼容 `shopName` / `storeName` |
| `{{product}}` | 产品名 |
| `{{platform}}` | 平台：`meituan` / `eleme` |
| `{{layout}}` | 根据平台派生的构图要求 |
| `{{appearanceClause}}` | 主题色和品牌风格派生说明 |
| `{{productNameIntro}}` | 产品名是否写入的说明 |
| `{{productNameInstruction}}` | 产品名入图要求 |
| `{{sourceReferenceList}}` | 修改图片主产品图列表 |
| `{{optionalReferenceList}}` | 修改图片可选参考图列表 |
| `{{imageEditRoleClause}}` | 修改图片的主图/参考图角色说明 |
| `{{imageEditReverseGuard}}` | 修改图片反向操作禁令 |

如果模板引用了不存在的占位符，网关会报错并拒绝生成，便于第一时间发现模板问题。

## 6. 发布注意事项

- 不要把真实密钥、数据库连接串、OSS AccessKey、完整签名 URL 写入模板或文档。
- 修改生产模板前先备份。
- 修改 JSON 后先用 `jq empty` 或等价 JSON 校验工具验证格式。
- 纯 prompt 调整只需重启 `csgh-backend-gateway`；不需要重启 Caddy。
- 首次上线云端 prompt 能力时，需要同时部署新网关，并让员工客户端更新到支持 `prompt_config` 的版本。
