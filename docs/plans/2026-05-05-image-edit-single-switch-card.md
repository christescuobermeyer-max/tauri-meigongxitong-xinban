# 修改图片单卡切换 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将“修改图片”页面从 4 个独立输入框和 4 个独立结果框，改为 1 个工具类型切换组件、1 个动态输入框、1 个动态生成结果框。

**Architecture:** 保留现有 `useImageEditWorkspace` 的数据结构，每个类型仍独立保存上传图、修改要求和生成结果。UI 层新增 `activeKind` 当前选中类型，切换“头像 / 店招 / 海报 / 产品图”时只渲染当前类型的输入区和结果区，生成、重试、下载都只作用于当前类型。

**Tech Stack:** React 18、TypeScript、Vite、Tauri、现有 CSS 变量与 `.segmented` 切换组件样式。

---

## 需求梳理

当前“修改图片”页面的问题：

- 左侧一次性显示 4 个独立卡片：头像、店招、海报、产品图。
- 右侧一次性显示 4 个生成结果卡片。
- 页面显得拥挤，不符合用户想要的“线路1 / 线路2 / 线路3”这种切换式交互。

用户期望的交互：

- “修改图片”只保留一个主组件框。
- 主组件框顶部增加一个切换组件，按钮为：头像、店招、海报、产品图。
- 点击“头像”时，下方输入区变成头像上传、头像修改要求、开始修改头像按钮。
- 点击“店招”时，下方输入区变成店招上传、店招修改要求、开始修改店招按钮。
- 点击“海报”时，下方输入区变成海报上传、海报修改要求、开始修改海报按钮。
- 点击“产品图”时，下方输入区变成产品图上传、产品图修改要求、开始修改产品图按钮，并继续显示产品名称识别。
- 右侧生成结果区也只显示当前选中类型的生成框。
- 切换到其它类型后，之前类型上传的图片、修改要求和生成结果要保留；切回来还能看到。

不需要改动的内容：

- 不改侧边栏入口。
- 不改三线路接口。
- 不改 prompt。
- 不改 OSS 上传和云数据库记录。
- 不改头像、店招、海报、产品图的原有尺寸规则。

## 当前代码结构

相关文件：

- `src/components/ImageEditPage.tsx`
- `src/components/ImageEditInputCard.tsx`
- `src/components/ImageEditResults.tsx`
- `src/hooks/useImageEditWorkspace.ts`
- `src/lib/image-edit.ts`
- `src/styles/global.css`
- `tests/image-edit-tool.test.ts`

当前关键实现：

- `ImageEditPage.tsx` 通过 `IMAGE_EDIT_KINDS.map(...)` 一次性渲染 4 个 `ImageEditInputCard`。
- `ImageEditResults.tsx` 通过 `IMAGE_EDIT_KINDS.map(...)` 一次性渲染 4 个 `GenerationResultTile`。
- `useImageEditWorkspace.ts` 已经用 `Record<ImageEditKind, Entry>` 分别保存 4 种类型的数据，这一点可以直接复用，不需要重写业务逻辑。

目标改法：

- 新增 `ImageEditKindSelect.tsx`，专门负责“头像 / 店招 / 海报 / 产品图”切换。
- `ImageEditPage.tsx` 内新增 `activeKind` 状态。
- `ImageEditPage.tsx` 不再 map 渲染 4 个输入卡，只给 `ImageEditInputCard` 传当前 `activeKind` 的数据。
- `ImageEditResults.tsx` 不再 map 渲染 4 个结果卡，只展示当前 `activeKind` 的 `GenerationResultTile`。
- `ImageEditInputCard.tsx` 改为“内容组件”，不要再自己包一层 `section.card`，避免页面出现多个卡片框。

## 验收标准

必须同时满足：

- 修改图片页面左侧仍保留顶部“生图线路”卡片。
- 生图线路下方只出现一个“修改图片”主卡片。
- “修改图片”主卡片里有 4 个切换按钮：头像、店招、海报、产品图。
- 默认选中“头像”。
- 点击不同类型后，上传区域标题、尺寸提示、按钮文案、结果标题都会同步变化。
- 右侧结果区任意时刻只显示 1 个结果卡片。
- 产品图类型仍然 `showProductName={true}`，其它类型为 `false`。
- 生成、重试、下载调用的 `kind` 必须是当前选中的类型。
- 切换类型不会清空其它类型已上传的图片、修改要求或结果。
- `npm run build` 通过。

## Task 1: 新增图片类型切换组件

**Files:**

- Create: `src/components/ImageEditKindSelect.tsx`
- Test: `tests/image-edit-tool.test.ts`

**Step 1: 先更新测试**

在 `tests/image-edit-tool.test.ts` 追加这些断言：

```ts
const kindSelectSource = readFileSync(
  new URL("../src/components/ImageEditKindSelect.tsx", import.meta.url),
  "utf8"
);

equal(pageSource.includes("ImageEditKindSelect"), true);
equal(kindSelectSource.includes('aria-label="修改图片类型"'), true);
equal(kindSelectSource.includes("IMAGE_EDIT_KINDS.map"), true);
equal(kindSelectSource.includes("IMAGE_EDIT_LABEL[kind]"), true);
equal(kindSelectSource.includes('className="segmented image-edit-kind-select"'), true);
```

**Step 2: 运行测试确认失败**

Run:

```bash
node tests/image-edit-tool.test.ts
```

Expected:

- 失败，原因是 `ImageEditKindSelect.tsx` 文件不存在，或 `ImageEditPage.tsx` 尚未引用 `ImageEditKindSelect`。

**Step 3: 新增组件**

创建 `src/components/ImageEditKindSelect.tsx`：

```tsx
import { IMAGE_EDIT_KINDS, IMAGE_EDIT_LABEL, type ImageEditKind } from "../lib/image-edit";

interface Props {
  value: ImageEditKind;
  disabled?: boolean;
  onChange: (kind: ImageEditKind) => void;
}

export default function ImageEditKindSelect({ value, disabled = false, onChange }: Props) {
  return (
    <div className="segmented image-edit-kind-select" role="tablist" aria-label="修改图片类型">
      {IMAGE_EDIT_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          role="tab"
          className="segmented__item"
          data-active={value === kind}
          aria-selected={value === kind}
          disabled={disabled}
          onClick={() => onChange(kind)}
        >
          {IMAGE_EDIT_LABEL[kind]}
        </button>
      ))}
    </div>
  );
}
```

说明：

- 复用现有 `.segmented` 和 `.segmented__item`，视觉上与线路切换保持一致。
- `disabled={busy}` 时可以避免生成中误切换导致用户看不到当前生成状态。

**Step 4: 运行测试**

Run:

```bash
node tests/image-edit-tool.test.ts
```

Expected:

- 此时可能仍失败，因为 `ImageEditPage.tsx` 还没有接入新组件。继续 Task 2。

## Task 2: 将左侧 4 个输入卡改成 1 个动态主卡

**Files:**

- Modify: `src/components/ImageEditPage.tsx`
- Modify: `src/components/ImageEditInputCard.tsx`
- Test: `tests/image-edit-tool.test.ts`

**Step 1: 更新测试**

在 `tests/image-edit-tool.test.ts` 修改或追加断言：

```ts
equal(pageSource.includes("useState<ImageEditKind>"), true);
equal(pageSource.includes('useState<ImageEditKind>("avatar")'), true);
equal(pageSource.includes("const activeEntry = entries[activeKind]"), true);
equal(pageSource.includes("IMAGE_EDIT_KINDS.map"), false);
equal(pageSource.includes("kind={activeKind}"), true);
equal(pageSource.includes("images={activeEntry.images}"), true);
equal(pageSource.includes("instruction={activeEntry.instruction}"), true);
```

注意：

- `ImageEditKindSelect.tsx` 可以继续使用 `IMAGE_EDIT_KINDS.map`。
- 上面的 `IMAGE_EDIT_KINDS.map` 断言只针对 `ImageEditPage.tsx`，表示页面本身不要再渲染 4 个输入卡。

**Step 2: 运行测试确认失败**

Run:

```bash
node tests/image-edit-tool.test.ts
```

Expected:

- 失败，因为当前 `ImageEditPage.tsx` 仍然 map 渲染 4 个 `ImageEditInputCard`。

**Step 3: 修改 `ImageEditInputCard.tsx`**

把 `ImageEditInputCard` 从“独立卡片”改成“主卡片内部内容”。

核心要求：

- 删除最外层 `<section className="card image-edit-card">`。
- 删除内部 `card__header`。
- 返回一个普通 `<div className="image-edit-card__body">`。
- 保留上传、修改要求、按钮逻辑。
- 在内容顶部补充当前类型尺寸提示，避免用户不知道当前是头像 / 店招 / 海报 / 产品图。

建议结构：

```tsx
return (
  <div className="image-edit-card__body">
    <div className="image-edit-active-meta">
      <span>{spec.sourceLabel}</span>
      <span>导出 {spec.exportLabel}</span>
    </div>
    <div className="field">
      <label className="field__label">{spec.uploadTitle}</label>
      <ImageUpload
        images={images}
        onChange={onImagesChange}
        maxCount={1}
        dropzoneTitle={`点击、拖拽或 Ctrl+V 粘贴 1 张${label}图片`}
        compressedLabel={`${label}参考图`}
        showProductName={kind === "product"}
      />
    </div>
    <div className="field">
      <label className="field__label">修改要求</label>
      <textarea
        className="textarea"
        value={instruction}
        onChange={(event) => onInstructionChange(event.target.value)}
        placeholder={`写清楚要如何调整这张${label}，例如：保持主体不变，增强背景氛围，替换文字为...`}
        maxLength={300}
      />
      <span className="field__hint">会严格参考上传图片，只按这里的文字要求修改</span>
    </div>
    <button className="btn btn--primary btn--block" disabled={!canGenerate} onClick={onGenerate}>
      <IconSparkles style={{ width: 14, height: 14 }} />
      {busy ? "修改中…" : `开始修改${label}`}
    </button>
  </div>
);
```

**Step 4: 修改 `ImageEditPage.tsx`**

改动点：

- 引入 `useState`。
- 引入 `ImageEditKindSelect`。
- 删除 `IMAGE_EDIT_KINDS.map(...)`。
- 新增 `activeKind` 和 `activeEntry`。
- 在一个主卡片中放切换组件、店铺/平台、动态输入区。

建议结构：

```tsx
import { useState } from "react";
import { type ImageEditKind } from "../lib/image-edit";
import ImageEditKindSelect from "./ImageEditKindSelect";
```

在组件内部：

```tsx
const [activeKind, setActiveKind] = useState<ImageEditKind>("avatar");
const activeEntry = entries[activeKind];
```

替换左侧 JSX：

```tsx
<div className="panel-stack">
  <GenerationLineCard value={generationLine} onChange={setGenerationLine} />
  <section className="card image-edit-card">
    <div className="card__header image-edit-card__header">
      <div className="card__heading">
        <div className="card__title">修改图片</div>
        <span className="card__hint">选择图片类型，上传原图并填写修改要求</span>
      </div>
      <ImageEditKindSelect value={activeKind} disabled={busy} onChange={setActiveKind} />
    </div>
    <div className="card__body image-edit-settings">
      <div className="field">
        <label className="field__label">店铺名称</label>
        <input
          className="input"
          placeholder="用于归档、命名和辅助生成"
          value={shopName}
          onChange={(event) => setShopName(event.target.value)}
          maxLength={40}
        />
      </div>
      <div className="field">
        <label className="field__label">投放平台</label>
        <PlatformSelect value={platform} onChange={setPlatform} />
        <span className="field__hint">按当前图片类型使用对应平台导出尺寸</span>
      </div>
    </div>
    <ImageEditInputCard
      kind={activeKind}
      platform={currentPlatform}
      images={activeEntry.images}
      instruction={activeEntry.instruction}
      busy={busy}
      onImagesChange={(images) => setImages(activeKind, images)}
      onInstructionChange={(value) => setInstruction(activeKind, value)}
      onGenerate={() => onGenerate(activeKind)}
    />
  </section>
</div>
```

右侧调用先临时改成：

```tsx
<ImageEditResults
  platform={currentPlatform}
  activeKind={activeKind}
  entries={entries}
  onRetry={onGenerate}
  onDownload={onDownload}
/>
```

Task 3 会同步修改 `ImageEditResults` 的 props。

**Step 5: 运行测试**

Run:

```bash
node tests/image-edit-tool.test.ts
```

Expected:

- 可能因为 `ImageEditResults` 尚未支持 `activeKind` 导致 TypeScript 构建失败，继续 Task 3。

## Task 3: 将右侧 4 个结果卡改成 1 个动态结果卡

**Files:**

- Modify: `src/components/ImageEditResults.tsx`
- Test: `tests/image-edit-tool.test.ts`

**Step 1: 更新测试**

在 `tests/image-edit-tool.test.ts` 追加：

```ts
const resultsSource = readFileSync(
  new URL("../src/components/ImageEditResults.tsx", import.meta.url),
  "utf8"
);

equal(resultsSource.includes("activeKind: ImageEditKind"), true);
equal(resultsSource.includes("const activeEntry = entries[activeKind]"), true);
equal(resultsSource.includes("IMAGE_EDIT_KINDS.map"), false);
equal(resultsSource.includes("item={activeEntry.item}"), true);
equal(resultsSource.includes("onRetry={() => onRetry(activeKind)}"), true);
equal(resultsSource.includes("onDownload={() => onDownload(activeKind)}"), true);
```

**Step 2: 运行测试确认失败**

Run:

```bash
node tests/image-edit-tool.test.ts
```

Expected:

- 失败，因为 `ImageEditResults.tsx` 当前仍然 map 渲染 4 个结果卡。

**Step 3: 修改 `ImageEditResults.tsx`**

目标结构：

```tsx
import { getImageEditSpec, IMAGE_EDIT_LABEL, type ImageEditKind } from "../lib/image-edit";
import type { GenerationItem, PlatformSpec } from "../types";
import GenerationResultTile from "./GenerationResultTile";

interface Props {
  platform: PlatformSpec;
  activeKind: ImageEditKind;
  entries: Record<ImageEditKind, { item: GenerationItem }>;
  onRetry: (kind: ImageEditKind) => void;
  onDownload: (kind: ImageEditKind) => void;
}

export default function ImageEditResults({
  platform,
  activeKind,
  entries,
  onRetry,
  onDownload,
}: Props) {
  const spec = getImageEditSpec(activeKind, platform);
  const label = IMAGE_EDIT_LABEL[activeKind];
  const activeEntry = entries[activeKind];

  return (
    <div>
      <div className="results__head">
        <h2 className="section-heading" style={{ margin: 0 }}>
          {label}修改结果
        </h2>
        <span className="meta-row">
          <span>
            平台 <strong>{platform.label}</strong>
          </span>
        </span>
      </div>
      <div className="results image-edit-results">
        <GenerationResultTile
          title={`${label}修改结果`}
          sub={spec.sourceLabel}
          item={activeEntry.item}
          exportSize={spec.exportLabel}
          idleMessage={`上传${label}图片并填写修改要求后生成`}
          onRetry={() => onRetry(activeKind)}
          onDownload={() => onDownload(activeKind)}
        />
      </div>
    </div>
  );
}
```

**Step 4: 运行测试**

Run:

```bash
node tests/image-edit-tool.test.ts
```

Expected:

- 通过。

## Task 4: 调整样式，保证单卡切换 UI 好看

**Files:**

- Modify: `src/styles/global.css`
- Test: `tests/image-edit-tool.test.ts`

**Step 1: 更新测试**

在 `tests/image-edit-tool.test.ts` 追加：

```ts
const globalCssSource = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

equal(globalCssSource.includes(".image-edit-card__header"), true);
equal(globalCssSource.includes(".image-edit-kind-select"), true);
equal(globalCssSource.includes(".image-edit-active-meta"), true);
```

**Step 2: 增加 CSS**

在 `src/styles/global.css` 现有 `.image-edit-page` 附近补充：

```css
.image-edit-card__header {
  gap: 14px;
  align-items: center;
}

.image-edit-kind-select {
  justify-self: end;
}

.image-edit-active-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--fg-muted);
  font-size: 12px;
}

.image-edit-active-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
}

@media (max-width: 720px) {
  .image-edit-card__header {
    align-items: stretch;
  }

  .image-edit-kind-select {
    justify-self: stretch;
    width: 100%;
    grid-auto-flow: row;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

注意：

- 不要改全局 `.segmented` 的基础样式，避免影响平台选择和线路选择。
- 只给 `.image-edit-kind-select` 做局部增强。

**Step 3: 运行测试**

Run:

```bash
node tests/image-edit-tool.test.ts
```

Expected:

- 通过。

## Task 5: 构建验证和手动验收

**Files:**

- No code changes.

**Step 1: 跑相关测试**

Run:

```bash
node tests/image-edit-tool.test.ts
node tests/retry-confirm-dialog.test.ts
node tests/sidebar-layout.test.ts
```

Expected:

- 全部通过，退出码为 0。

**Step 2: 跑构建**

Run:

```bash
npm run build
```

Expected:

- `tsc -b && vite build` 通过。
- 不能有 TypeScript 类型错误。

**Step 3: 手动打开页面验收**

启动桌面开发服务器：

```bash
npm run tauri:dev
```

手动检查：

- 进入“修改图片”侧边栏。
- 左侧只看到一个“修改图片”主卡片，而不是 4 个头像 / 店招 / 海报 / 产品图卡片。
- 主卡片顶部有“头像 / 店招 / 海报 / 产品图”切换按钮。
- 默认选中“头像”。
- 点击“店招”，上传标题变成“上传 1 张店招图”，按钮变成“开始修改店招”。
- 点击“海报”，尺寸提示显示 `21:9` 横版，按钮变成“开始修改海报”。
- 点击“产品图”，上传区域仍能展示识别出的产品名称。
- 右侧结果区始终只显示当前选中的一种类型结果。
- 在“头像”填写内容后切到“店招”，再切回“头像”，头像输入内容仍保留。

## 风险点和处理方式

风险 1：生成中切换类型导致用户看不到正在生成的结果。

- 处理：`ImageEditKindSelect` 支持 `disabled`，生成中禁用切换。

风险 2：产品图名称识别丢失。

- 处理：`ImageEditInputCard` 里继续保留 `showProductName={kind === "product"}`。

风险 3：重试或下载拿错类型。

- 处理：`ImageEditResults` 的 `onRetry` 和 `onDownload` 必须使用 `activeKind`，不要写死。

风险 4：其它类型数据被切换清空。

- 处理：不要改 `useImageEditWorkspace` 的 `entries` 结构；切换只改 UI 的 `activeKind`。

风险 5：页面文件超过行数限制。

- 处理：新增 `ImageEditKindSelect.tsx` 独立组件，避免把切换按钮逻辑塞进 `ImageEditPage.tsx`。

## 建议提交顺序

1. `test: add image edit single card switch expectations`
2. `feat: add image edit kind selector`
3. `refactor: render active image edit input only`
4. `refactor: render active image edit result only`
5. `style: polish image edit switch card`

## 最终交付清单

完成后应包含：

- 新文件：`src/components/ImageEditKindSelect.tsx`
- 修改：`src/components/ImageEditPage.tsx`
- 修改：`src/components/ImageEditInputCard.tsx`
- 修改：`src/components/ImageEditResults.tsx`
- 修改：`src/styles/global.css`
- 修改：`tests/image-edit-tool.test.ts`

最终验证命令：

```bash
node tests/image-edit-tool.test.ts
node tests/retry-confirm-dialog.test.ts
node tests/sidebar-layout.test.ts
npm run build
```

验收结论必须以命令输出为准，不要只看页面感觉。
