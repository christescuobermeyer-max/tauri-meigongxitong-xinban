import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspaceSource = readFileSync(new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url), "utf8");
const workspacePagesSource = readFileSync(new URL("../src/components/WorkspacePages.tsx", import.meta.url), "utf8");
const productPanelSource = readFileSync(new URL("../src/components/ProductGeneratePanel.tsx", import.meta.url), "utf8");
const batchPanelSource = readFileSync(new URL("../src/components/ProductBatchGeneratePanel.tsx", import.meta.url), "utf8");
const imageEditPageSource = readFileSync(new URL("../src/components/ImageEditPage.tsx", import.meta.url), "utf8");
const imageEditHookSource = readFileSync(new URL("../src/hooks/useImageEditWorkspace.ts", import.meta.url), "utf8");
const batchHookSource = readFileSync(new URL("../src/hooks/useProductBatchWorkspace.ts", import.meta.url), "utf8");
const platformSelectSource = readFileSync(new URL("../src/components/PlatformSelect.tsx", import.meta.url), "utf8");

ok(workspaceSource.includes('useState<Platform | null>(null)'), "全局平台状态默认应为未选择");
ok(workspaceSource.includes("productPlatform"), "制作1张设计图应使用独立平台状态");
ok(workspaceSource.includes("productBatchPlatform"), "制作全店图应使用独立平台状态");
ok(workspaceSource.includes("imageEditPlatform"), "修改图片应使用独立平台状态");
ok(workspaceSource.includes("const productCurrentPlatform = productPlatform ? getPlatform(productPlatform) : null"), "制作1张设计图未选择平台时不应默认取美团规格");
ok(workspaceSource.includes("const productBatchCurrentPlatform = productBatchPlatform ? getPlatform(productBatchPlatform) : null"), "制作全店图未选择平台时不应默认取美团规格");
ok(workspaceSource.includes("const imageEditCurrentPlatform = imageEditPlatform ? getPlatform(imageEditPlatform) : null"), "修改图片未选择平台时不应默认取美团规格");
ok(workspaceSource.includes('toast.show("请先选择投放平台：美团或淘宝闪购"'), "制作1张设计图应校验平台");
ok(workspacePagesSource.includes("platform={workspace.productBatchPlatform}"), "制作全店图页面应使用独立平台状态");
ok(workspacePagesSource.includes("platform={workspace.imageEditPlatform}"), "修改图片页面应使用独立平台状态");

ok(productPanelSource.includes("platform: Platform | null"), "制作1张设计图平台 props 应允许未选择");
ok(productPanelSource.includes("platformSpec ?"), "制作1张设计图未选平台时应展示引导文案");
ok(productPanelSource.includes("Boolean(platform)"), "制作1张设计图按钮状态应要求先选平台");

ok(batchPanelSource.includes("platform: Platform | null"), "制作全店图平台 props 应允许未选择");
ok(batchPanelSource.includes("platformSpec ?"), "制作全店图未选平台时应展示引导文案");
ok(batchPanelSource.includes("Boolean(platform)"), "制作全店图按钮状态应要求先选平台");
ok(batchHookSource.includes("if (!platform || !currentPlatform)"), "制作全店图生成层应拦截未选择平台");

ok(imageEditPageSource.includes("platform: Platform | null"), "修改图片平台 props 应允许未选择");
ok(imageEditPageSource.includes("currentPlatform: PlatformSpec | null"), "修改图片规格应允许未选择平台");
ok(imageEditHookSource.includes("if (!platform || !currentPlatform)"), "修改图片生成层应拦截未选择平台");

ok(platformSelectSource.includes("value: Platform | null"), "平台切换组件应支持无选中态");
equal(platformSelectSource.includes('data-active={value === p.id}'), true);
