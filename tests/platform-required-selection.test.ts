import { equal, ok } from "node:assert/strict";
import { readProjectFile as readFileSync } from "./helpers/source-tree.mjs";

const workspaceSource = readFileSync(new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url), "utf8");
const workspacePagesSource = readFileSync(new URL("../src/components/WorkspacePages.tsx", import.meta.url), "utf8");
const productPanelSource = readFileSync(new URL("../src/components/ProductGeneratePanel.tsx", import.meta.url), "utf8");
const batchPanelSource = readFileSync(new URL("../src/components/ProductBatchGeneratePanel.tsx", import.meta.url), "utf8");
const imageEditPageSource = readFileSync(new URL("../src/components/ImageEditPage.tsx", import.meta.url), "utf8");
const imageEditHookSource = readFileSync(new URL("../src/hooks/useImageEditWorkspace.ts", import.meta.url), "utf8");
const batchHookSource = readFileSync(new URL("../src/hooks/useProductBatchWorkspace.ts", import.meta.url), "utf8");
const platformSelectSource = readFileSync(new URL("../src/components/PlatformSelect.tsx", import.meta.url), "utf8");

const productHook = readFileSync(new URL("../src/hooks/useProductImageWorkspace.ts", import.meta.url), "utf8");
for (const source of [productHook, batchHookSource, imageEditHookSource]) {
  ok(source.includes('useState<Platform | null>(null)'), "每个工具应保留未选择的平台初始值");
  ok(source.includes("platform ? getPlatform(platform) : null"), "未选平台不能默认为美团");
  ok(source.includes("请先选择投放平台：美团或淘宝闪购"), "生成前必须校验投放平台");
}
ok(workspaceSource.includes("useWorkspaceSlots"), "工具平台状态由各独立槽位持有");
ok(workspacePagesSource.includes("ProductBatchWorkspacePage"));
ok(workspacePagesSource.includes("ImageEditWorkspacePage"));

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
equal(platformSelectSource.includes('const isActive = value === p.id'), true);
equal(platformSelectSource.includes('data-active={isActive}'), true);
