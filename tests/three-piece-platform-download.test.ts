import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const generatePanel = readFileSync(
  new URL("../src/components/GeneratePanel.tsx", import.meta.url),
  "utf8"
);
const resultPanel = readFileSync(
  new URL("../src/components/ResultPanel.tsx", import.meta.url),
  "utf8"
);
const workspacePages = readFileSync(
  new URL("../src/components/WorkspacePages.tsx", import.meta.url),
  "utf8"
);
const workspaceHook = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8"
);
const threePiecePage = workspacePages.slice(
  workspacePages.indexOf("<GeneratePanel"),
  workspacePages.indexOf('if (workspace.tab === "productImage")')
);

equal(generatePanel.includes("PlatformSelect"), false, "三件套输入区不应再渲染平台选择");
equal(generatePanel.includes("投放平台"), false, "三件套输入区不应再显示投放平台字段");
equal(generatePanel.includes("setPlatform"), false, "三件套输入组件不应接收平台切换函数");

ok(resultPanel.includes("批量下载美团尺寸"), "三件套结果区应提供美团尺寸批量下载");
ok(resultPanel.includes("批量下载淘宝闪购尺寸"), "三件套结果区应提供淘宝闪购尺寸批量下载");
equal(resultPanel.includes("平台 <strong>"), false, "三件套结果区不应显示单一当前平台");
ok(resultPanel.includes("getPlatform(\"meituan\")"), "三件套结果区应展示美团导出尺寸");
ok(resultPanel.includes("getPlatform(\"taobao\")"), "三件套结果区应展示淘宝闪购导出尺寸");
ok(resultPanel.includes("downloadOptions"), "三件套单张下载按钮应提供平台下拉选项");
ok(resultPanel.includes('label: "下载美团尺寸"'), "三件套单张下载下拉应包含美团尺寸");
ok(resultPanel.includes('label: "下载淘宝闪购尺寸"'), "三件套单张下载下拉应包含淘宝闪购尺寸");

equal(
  threePiecePage.includes("setPlatform={workspace.setPlatform}"),
  false,
  "三件套页面不应把平台切换传给 GeneratePanel"
);
ok(resultPanel.includes('onBatchDownload("meituan")'), "美团批量下载按钮应指定美团平台");
ok(resultPanel.includes('onBatchDownload("taobao")'), "淘宝闪购批量下载按钮应指定淘宝平台");
ok(
  workspacePages.includes("workspace.handleDownload(kind, platform)"),
  "三件套单张下载应使用下拉菜单选择的平台导出"
);
ok(
  workspaceHook.includes("handleBatchDownload(targetPlatform"),
  "批量下载处理函数应支持传入目标平台"
);
ok(
  workspaceHook.includes('pushHistoryEntry("avatar", avatar, "meituan")') &&
    workspaceHook.includes('pushHistoryEntry("storefront", storefront, "meituan")') &&
    workspaceHook.includes('pushHistoryEntry("poster", poster, "meituan")'),
  "三件套云端记录不应沿用其他工具隐藏的平台状态"
);
