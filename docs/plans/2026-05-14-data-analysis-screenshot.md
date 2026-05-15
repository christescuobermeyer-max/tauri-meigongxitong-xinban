# 数据分析截图生图 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在品牌故事下方新增“数据分析”分类页，迁移旧项目“截图生成数据分析图”的核心流程，并改为调用当前项目五条生图线路。

**Architecture:** 新功能作为当前工作区的一个独立 tab 接入 `Sidebar`、`WorkspaceShell`、`WorkspacePages` 和 `useGenerationWorkspace`。业务逻辑放到 `src/lib/data-analysis.ts` 与 `src/hooks/useDataAnalysisWorkspace.ts`，页面组件只负责输入、上传、预览、下载和话术复制。生成接口统一走 `src/lib/tauri.ts` 的 `generateImage`，只把用户上传截图作为参考图，不迁移旧项目 Gemini API、旧 API key 或模板参考图。

**Tech Stack:** React 18、TypeScript、Tauri 2 IPC、当前 image-2 五线路、现有图片压缩/上传组件能力。

---

### Task 1: 数据分析领域函数

**Files:**
- Create: `src/lib/data-analysis.ts`
- Test: `tests/data-analysis.test.ts`

**Steps:**
1. 写测试，覆盖 prompt 包含店铺名、截图数据分析要求、禁止虚构数据、以及五线路尺寸解析。
2. 运行 `node tests/data-analysis.test.ts`，确认因文件不存在失败。
3. 实现 `buildDataAnalysisPrompt`、`resolveDataAnalysisSize`、`DATA_ANALYSIS_COPY_TEXT`。
4. 重新运行测试。

### Task 2: 工作区状态 Hook

**Files:**
- Create: `src/hooks/useDataAnalysisWorkspace.ts`
- Modify: `src/hooks/useGenerationWorkspace.ts`
- Test: `tests/data-analysis.test.ts`

**Steps:**
1. 扩展测试，确认 `useGenerationWorkspace` 暴露 `dataAnalysis`，tab 联合类型包含 `dataAnalysis`。
2. 实现 hook：店铺名、截图、生成项、忙碌态、生成、重试、下载、复制话术。
3. 生成时调用 `generateImage({ prompt, size, product_images: [截图base64], api_line: generationLine })`。
4. 下载使用现有 `pickSavePath` 和 `resizeAndSaveImage`，导出为 `1536x1024`。

### Task 3: 页面与导航

**Files:**
- Create: `src/components/DataAnalysisPage.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/WorkspaceShell.tsx`
- Modify: `src/components/WorkspacePages.tsx`
- Test: `tests/data-analysis.test.ts`

**Steps:**
1. 扩展测试，确认侧边栏品牌故事后出现“数据分析”，页面挂载 `DataAnalysisPage`。
2. 实现页面：店铺名输入、线路选择、截图上传、生成按钮、结果预览、下载、重试、话术复制。
3. UI 复用现有 `ImageUpload`、`GenerationResultTile`、`GenerationLineSelect` 和按钮样式。

### Task 4: 验证

**Commands:**
- `node tests/data-analysis.test.ts`
- `npm run build`

**Expected:**
- 数据分析测试通过。
- TypeScript 与 Vite 构建通过。
