# 视频店招功能迁移文档

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `F:\claude-code\vo前端生成的桌面应用代码` 中的“外卖视频店招制作工具”完整迁移到当前美工生图系统，在侧边栏新增“视频店招”工作区。

**Architecture:** 保留源工具的核心工作流：解析小红书/抖音链接或选择本地视频，下载/预览，拖拽裁剪 16:9 区域，选择时间片段，调用 FFmpeg 导出无声 MP4。前端改为当前项目的 Vite + React 组件风格，Tauri 命令移植到当前 `src-tauri` 并注册到现有 invoke handler。

**Tech Stack:** React 18、Vite、Tauri 2、Rust、FFmpeg、yt-dlp、当前项目自有 CSS/图标/Toast 组件。

---

## 1. 源功能拆解

源项目关键文件：

- `components/video-tool/video-tool-page/index.tsx`：主页面，负责链接输入、本地上传、导出按钮和历史列表布局。
- `components/video-tool/video-tool-page/use-video-tool.ts`：业务状态，负责平台识别、链接解析、下载预览、导出调用。
- `components/video-tool/video-editor.tsx`：视频预览、播放控制、裁剪框和时间轴组合。
- `components/video-tool/crop-box.tsx`：16:9 裁剪框，输出原视频像素坐标。
- `components/video-tool/timeline-slider.tsx`：时间范围选择。
- `components/video-tool/video-history.tsx`：列出导出的 MP4，并支持另存。
- `src-tauri/src/video_commands.rs`：视频解析、下载、FFmpeg 导出、历史列表、复制文件。
- `src-tauri/src/xiaohongshu_cookie_support.rs`、`xiaohongshu_guard.rs`：小红书 yt-dlp cookie 支持和失败提示。
- `src-tauri/tauri.conf.json`：`externalBin` 打包 FFmpeg/yt-dlp，启用 asset protocol 读取本地视频。

## 2. 当前项目接入点

当前项目不是工具中心弹窗，而是固定工作区：

- `src/hooks/useGenerationWorkspace.ts`：新增 `videoSignboard` tab，不纳入 AI 生图并发计数。
- `src/components/Sidebar.tsx`：新增“视频店招”侧边栏项。
- `src/components/WorkspacePages.tsx`：新增页面分支。
- `src/components/workspace/VideoSignboardWorkspacePage.tsx`：承载视频工具页面。
- `src/components/video-signboard/*`：迁移后的前端组件。
- `src-tauri/src/lib.rs`：注册视频命令。
- `src-tauri/src/video_commands.rs` 等：新增 Rust 命令模块。
- `src-tauri/Cargo.toml`：增加 `regex`、`uuid` 依赖。
- `src-tauri/tauri.conf.json`：启用本地 asset protocol scope、声明 `binaries/ffmpeg` 和 `binaries/yt-dlp`。

## 3. 迁移策略

1. 前端不复制 shadcn/Radix 组件，全部改为当前项目的 `panel`、`card`、`btn`、`field`、`badge`、`Toast` 风格。
2. 图标使用当前 `Icons.tsx` 中的线性 SVG；新增缺失的播放、暂停、裁剪、视频图标。
3. 业务 hook 保持源逻辑，但把 `sonner` toast 改成当前 `useToast` 注入。
4. 支持两种输入：
   - 小红书/抖音分享链接：Tauri 解析并下载到本地缓存后预览。
   - 本地视频：Tauri dialog 选择文件，直接预览并导出。
5. 导出规格：
   - 美团：`692x390`，无声 MP4。
   - 淘宝闪购：`1280x720`，5-90 秒，200MB 上限。
6. 历史列表读取 `Documents/VideoExports` 下的 MP4，支持刷新、打开文件夹、另存。

## 4. 测试计划

- 新增结构测试 `tests/video-signboard-migration.test.ts`：
  - 断言侧边栏包含 `videoSignboard` 和“视频店招”。
  - 断言 `WorkspaceTab`、`WorkspacePages` 已接入。
  - 断言前端组件、hook、CSS 存在。
  - 断言 Tauri 命令模块和 invoke handler 注册。
  - 断言 `tauri.conf.json` 包含 asset protocol 和 externalBin。
- 运行目标测试验证 RED/GREEN。
- 运行 `npm run build` 验证 TypeScript/Vite。
- 运行 `cargo check --manifest-path src-tauri/Cargo.toml` 验证 Rust。

## 5. 风险与处理

- 抖音/小红书解析受平台反爬影响，迁移保留源项目现有策略，不承诺所有链接永久可解析。
- 小红书部分链接需要 `小红书cookie.txt`，迁移保留 cookie 文件查找和临时 Netscape 转换。
- FFmpeg/yt-dlp 需要系统可执行文件或打包二进制。迁移会复制源项目 Windows 二进制到当前 `src-tauri/binaries`。
- Web 预览模式下 Tauri invoke 不可用，页面会展示错误提示；桌面端为正式运行环境。

## 6. 执行步骤

1. 写入结构测试并确认失败。
2. 新增视频前端组件和样式。
3. 接入侧边栏、工作区 tab 和页面分支。
4. 新增 Rust 视频命令、cookie 支持和 guard。
5. 注册 Tauri 命令、更新 Cargo/Tauri 配置、复制二进制。
6. 运行测试、构建和 Rust 检查。
