import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

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

// workspace 应实例化 5 个 slot
ok(workspaceSource.includes("productBatchSlot1 = useProductBatchWorkspace"));
ok(workspaceSource.includes("productBatchSlot2 = useProductBatchWorkspace"));
ok(workspaceSource.includes("productBatchSlot3 = useProductBatchWorkspace"));
ok(workspaceSource.includes("productBatchSlot4 = useProductBatchWorkspace"));
ok(workspaceSource.includes("productBatchSlot5 = useProductBatchWorkspace"));
ok(
  workspaceSource.includes("countBusySlots(productBatchSlots)"),
  "全局 busy 应聚合 5 个 slot",
);

// 页面应渲染 5 个 tab
for (const label of ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"]) {
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
  /\.multi-store-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5/.test(cssSource),
  "tab 应为 5 列等宽",
);

console.log("product batch multi-store contract: OK");
