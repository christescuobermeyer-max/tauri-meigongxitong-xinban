# 三件套与图片墙生成数量选择开发方案

> 日期：2026-09-09  
> 范围：三件套设计、图片墙生成  
> 目标：让用户在提交生成前选择本次需要生成的图片类型或数量，默认保持现有行为。

## 1. 背景

当前两个工作区的生成范围是固定的：

- **三件套设计**：一次提交固定依次生成头像、店招、海报三张图。
- **图片墙生成**：一次提交固定要求上传 3 张产品图，并依次生成 3 张图片墙。

业务上存在只需要补做某一类图片、或只需要生成 1-2 张图片墙的场景。现有固定三张的流程会增加等待时间、消耗额度，也容易生成不需要的结果。

## 2. 已确认需求

### 2.1 三件套设计

- 在三件套输入区新增图片类型选择控件。
- 可选择项：`头像`、`店招`、`海报`。
- 控件为多选，默认三项全部勾选，等价于现有一次性生成三件套。
- 用户可只勾选其中一项或两项，例如只勾选头像时，仅生成头像。
- 至少需要保留 1 项选中；不允许三项全部取消后提交。
- 点击生成时，未勾选项需要清空旧结果，并在结果区显示“本次未选择生成”，避免误把上次结果当成本次结果。
- 结果区保留头像、店招、海报三个卡片，布局不因选择减少而跳动。
- 批量下载只下载本次勾选且成功生成的图片。
- 只要本次勾选项全部成功生成，就允许批量下载；按钮文案和提示按已选项动态展示。

### 2.2 图片墙生成

- 在图片墙输入区新增生成数量选择控件。
- 可选项：`生成 1 张`、`生成 2 张`、`生成 3 张`。
- 该控件为互斥选择，使用单选按钮或分段按钮实现，不使用多选框。
- 默认选中 `生成 3 张`，保持现有行为。
- 选择数量后，上传区 `maxCount` 同步为对应数量。
- 若用户已上传 3 张后改选 `生成 1 张` 或 `生成 2 张`，自动保留前 N 张并移除后面的图片。
- 校验逻辑改为“上传图片数量必须等于选择数量”。
- 提交后只生成对应数量的图片墙。
- 结果区只显示所选数量对应的 1/2/3 个结果卡片。
- 批量下载只下载已选择并成功生成的图片墙。
- 图片墙沟通文案按实际数量动态展示：
  - 1 张：使用“这张专业图片墙”。
  - 2 张：使用“这两张统一风格的图片”。
  - 3 张：保留“三张统一风格的图片”的表达。

## 3. 现有实现入口

### 3.1 三件套设计

| 文件 | 当前职责 | 需要调整 |
|---|---|---|
| `src/hooks/useThreePieceWorkspace.ts` | 三件套状态、校验、排队、顺序生成、重试、下载 | 增加 selectedKinds 状态；按选择生成；未选项清空；动态批量下载口径 |
| `src/components/workspace/ThreePieceWorkspacePage.tsx` | 多店铺 tab 与三件套页面组装 | 透传 selectedKinds 和 setter 给输入区/结果区 |
| `src/components/GeneratePanel.tsx` | 三件套输入表单、上传、提交按钮、进度条 | 增加三项 checkbox；动态按钮文案、进度步骤、校验 |
| `src/components/ResultPanel.tsx` | 三件套结果卡、单张下载、批量下载、沟通文案 | 展示未选项状态；批量下载 meta 动态化 |
| `src/lib/generated-asset-files.ts` | 三件套批量下载可用性和保存逻辑 | 支持只校验/保存选中的 kind |
| `src/lib/generation-sequence.ts` | 返回头像、店招、海报固定序列 | 增加按选择过滤序列的辅助函数，或调用端过滤 |

### 3.2 图片墙生成

| 文件 | 当前职责 | 需要调整 |
|---|---|---|
| `src/hooks/usePictureWallWorkspace.ts` | 图片墙图片、条目、校验、生成、重试、下载 | 增加 targetCount 状态；同步裁剪 images；校验 targetCount；动态文案 |
| `src/components/workspace/PictureWallWorkspacePage.tsx` | 多店铺 tab 与图片墙页面组装 | 透传 targetCount 和 setter |
| `src/components/PictureWallPage.tsx` | 图片墙输入区、上传区、提交按钮 | 增加单选/分段控件；maxCount 改为 targetCount；标题和提示动态化 |
| `src/components/PictureWallResults.tsx` | 图片墙结果列表、下载、重试、沟通文案 | 按 entries 数量展示；沟通文案按数量动态化 |
| `src/lib/picture-wall.ts` | 图片墙条目构造、同步、生成与归档 | 当前 entries 已基于 images 数组生成，主要补充测试覆盖即可 |

## 4. 设计方案

### 4.1 类型设计

三件套新增局部类型：

```ts
type ThreePieceAssetKind = "avatar" | "storefront" | "poster";
type ThreePieceSelection = Record<ThreePieceAssetKind, boolean>;
```

默认值：

```ts
const DEFAULT_THREE_PIECE_SELECTION: ThreePieceSelection = {
  avatar: true,
  storefront: true,
  poster: true,
};
```

图片墙新增局部类型：

```ts
type PictureWallTargetCount = 1 | 2 | 3;
```

默认值：`3`。

### 4.2 三件套生成流程

1. 从 `selectedKinds` 计算本次生成序列，例如 `['avatar']`、`['storefront', 'poster']`。
2. 若没有任何选中项，toast 提示“请至少选择 1 个生成项目”。
3. 继续沿用当前店铺名、经营品类、产品图校验。
4. 点击生成时：
   - 对选中项设置为 `queued`。
   - 对未选中项设置为特殊 idle 状态，清空旧图片和错误，建议 `errorMessage: '本次未选择生成'` 或新增 UI prop 标识。
5. 上传参考图到 OSS。
6. 按选中序列逐个生成。
7. 如果前一项失败，只停止本次序列中尚未生成的后续选中项；未选中项保持“本次未选择生成”。
8. 历史记录只记录实际生成成功的图片。

说明：头像、店招、海报当前都参考上传产品图，不再依赖已生成头像。因此允许只生成店招或只生成海报，不要求头像先成功。

### 4.3 三件套下载流程

- `canBatchDownload` 从“头像、店招、海报全部成功”改为“本次选中项全部成功”。
- 批量下载参数增加 selectedKinds，保存函数只遍历选中的成功项。
- 单张下载和重试按钮仍保留在三个结果卡片中；未选项的下载按钮禁用，重试按钮可隐藏或显示为不可用。
- 批量下载 toast 使用实际数量：`已批量保存 N 张美团尺寸图片`。

### 4.4 图片墙生成流程

1. `usePictureWallWorkspace` 增加 `targetCount`，默认 3。
2. 当 `targetCount` 变小且 `images.length > targetCount` 时，自动 `setImages(images.slice(0, targetCount))`。
3. `ImageUpload.maxCount` 改为 `targetCount`。
4. `canGenerate` 和 hook 校验改为 `images.length === targetCount`。
5. `buildPictureWallEntries(images, 'queued')` 已天然按 images 数量生成，无需固定三张。
6. 生成循环继续遍历 `targetImages`，因此会自动生成 1/2/3 张。
7. 下载逻辑继续使用 `completedCount` 和 `entries`，天然适配 1/2/3 张。

### 4.5 UI 文案

三件套：

- 卡片 hint：从“填写后可一键生成头像、店招与海报”改为“选择需要生成的图片类型，默认生成完整三件套”。
- 按钮：
  - 全选：`开始生成头像、店招与海报`。
  - 只选头像：`开始生成头像`。
  - 选头像+店招：`开始生成头像、店招`。
- 进度条只显示选中的步骤。

图片墙：

- 卡片 hint：`选择生成数量后上传对应张数产品图`。
- 上传标题：`点击、拖拽或 Ctrl+V 粘贴 N 张图片墙产品图`。
- 生成中提示：`正在按顺序生成 N 张图片墙，请耐心等待…`。
- 校验提示：`请上传 N 张产品图片`。

## 5. 测试计划

### 5.1 新增/更新测试

- `tests/three-piece-selection.test.ts`：
  - 默认选中头像、店招、海报。
  - 不能取消到 0 项。
  - 只选头像时，生成序列只包含头像。
  - 未选项会清空旧结果并显示未选择状态。
  - 批量下载只要求并保存选中项。
- 更新 `tests/generation-concurrency-guard.test.ts`：
  - 原断言 `queueGenerationItems(getAvatarStorefrontPosterSequence(), setters)` 需要改为校验“选中项在 OSS 上传前进入 queued”。
- 更新 `tests/three-piece-platform-download.test.ts`：
  - 批量下载按钮仍支持美团/淘宝闪购，但 meta 文案允许动态选项。
- `tests/picture-wall-count-selection.test.ts`：
  - 默认 targetCount 为 3。
  - 选择 1/2/3 会改变上传上限。
  - targetCount 变小会裁剪多余图片。
  - 校验按目标张数提示。
  - 结果和沟通文案按 entries 数量展示。
- 更新 `tests/picture-wall-ui.test.ts`：
  - `maxCount={3}` 固定断言改为 targetCount 动态断言。

### 5.2 验证命令

```powershell
npm run build
npx tsx tests/three-piece-selection.test.ts
npx tsx tests/picture-wall-count-selection.test.ts
npx tsx tests/generation-concurrency-guard.test.ts
npx tsx tests/three-piece-platform-download.test.ts
npx tsx tests/picture-wall-ui.test.ts
```

## 6. 验收标准

- 三件套默认仍一次性生成头像、店招、海报。
- 三件套只勾选头像时，只提交头像生成请求，店招和海报不会排队、不会调用网关、不会写历史。
- 三件套未勾选项不会保留旧结果误导用户。
- 三件套批量下载只保存本次选中且成功的图片。
- 图片墙默认仍要求 3 张产品图并生成 3 张图片墙。
- 图片墙选择 1/2 张时，只能上传对应数量图片，也只生成对应数量结果。
- 图片墙从 3 张切到 1/2 张时，自动保留前 N 张，结果区同步对应数量。
- 历史记录、今日统计、累计统计只统计实际成功生成并归档的图片。
- `npm run build` 通过。

## 7. 非目标范围

- 不调整 image-2 网关线路、并发、重试策略。
- 不改 Supabase schema。
- 不改 OSS 归档口径。
- 不新增新的工作区或平台选择。
- 不改变三件套当前固定以美团平台记录历史、下载时可选美团/淘宝闪购尺寸的逻辑。

