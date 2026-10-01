import { ok } from "node:assert/strict";
import { readProjectFile as readFileSync } from "./helpers/source-tree.mjs";

const hookSource = readFileSync(
  new URL("../src/hooks/useProductBatchWorkspace.ts", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/components/workspace/ProductBatchWorkspacePage.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("../src/styles/global.css", import.meta.url),
  "utf8",
);

// hook 应从顶层 controlled 接收 generationLine + setGenerationLine（顶部栏同步）
ok(
  /generationLine:\s*GenerationLine/.test(hookSource),
  "hook 应接受 generationLine 参数",
);
ok(
  /setGenerationLine:\s*\(line:\s*GenerationLine\)\s*=>\s*void/.test(hookSource),
  "hook 应接受顶层 setGenerationLine 透传",
);
ok(
  !/useState<GenerationLine>/.test(hookSource),
  "hook 不应再自管理 generationLine state",
);

// 固定组合钩子为全店工具创建 10 个独立状态，统一聚合忙碌数。
ok((workspaceSource.match(/useProductBatchWorkspace\(/g) ?? []).length === 10);
ok(workspaceSource.includes("Object.values(slotGroups).reduce"));

// 页面应渲染 10 个 tab
for (const label of ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5", "店铺6", "店铺7", "店铺8", "店铺9", "店铺10"]) {
  ok(pageSource.includes(label), `页面应包含 ${label}`);
}
ok(pageSource.includes('role="tab"'));
ok(pageSource.includes("slots[activeIndex]"), "页面应根据 activeIndex 切换 slot");
ok(
  pageSource.includes("slot.handleGenerate") && pageSource.includes("slot.busy"),
  "每个 tab 应单独走 slot 自己的 handleGenerate 与 busy 状态",
);

// CSS 样式存在（已迁移为 multi-store-tabs 通用类，与 product-batch-tabs 共用同一规则）
ok(cssSource.includes(".multi-store-tabs"));
ok(cssSource.includes('.multi-store-tabs__item[data-active="true"]'));
ok(cssSource.includes('.multi-store-tabs__item[data-busy="true"]::after'));
ok(
  /\.multi-store-tabs\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/.test(cssSource),
  "tab 容器应横跨 .page 两列",
);
ok(
  /\.multi-store-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(10/.test(cssSource),
  "tab 应为 10 列等宽",
);

console.log("product batch multi-store contract: OK");
