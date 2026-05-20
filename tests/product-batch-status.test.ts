import { deepEqual, equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const batchSource = readFileSync(
  new URL("../src/lib/product-batch.ts", import.meta.url),
  "utf8"
);
const batchTranspiled = ts.transpileModule(batchSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const batchModule = await import(
  `data:text/javascript;base64,${Buffer.from(batchTranspiled).toString("base64")}`
);

equal(typeof batchModule.syncProductBatchEntries, "function");

const sourceImages = [
  {
    id: "a",
    name: "香辣鸡腿堡.jpg",
    dataUrl: "data:image/jpeg;base64,a",
    productName: "香辣鸡腿堡",
  },
  {
    id: "b",
    name: "双层牛肉堡.jpg",
    dataUrl: "data:image/jpeg;base64,b",
    productName: "双层牛肉堡",
  },
];

const queuedEntries = batchModule.buildProductBatchEntries(sourceImages, "queued");
const runningEntries = batchModule.applyProductBatchEntryUpdate(queuedEntries, "a", {
  ...queuedEntries[0].item,
  status: "running",
});

const syncedEntries = batchModule.syncProductBatchEntries(sourceImages, runningEntries);
deepEqual(
  syncedEntries.map((entry: { sourceImageId: string; item: { status: string } }) => ({
    id: entry.sourceImageId,
    status: entry.item.status,
  })),
  [
    { id: "a", status: "running" },
    { id: "b", status: "queued" },
  ]
);

const tileSource = readFileSync(
  new URL("../src/components/GenerationResultTile.tsx", import.meta.url),
  "utf8"
);
equal(tileSource.includes("compact?: boolean;"), true);
equal(tileSource.includes('data-layout={compact ? "compact" : "default"}'), true);
equal(tileSource.includes('item.status === "queued"'), true);
equal(tileSource.includes("等待生成中"), true);
equal(tileSource.includes("正在生成中"), true);

const stepsSource = readFileSync(
  new URL("../src/components/ProgressSteps.tsx", import.meta.url),
  "utf8"
);
equal(stepsSource.includes('type StepState = "idle" | "queued" | "running" | "done" | "failed";'), true);
equal(stepsSource.includes('if (status === "queued") return "queued";'), true);
equal(stepsSource.includes("等待中"), true);

const hookSource = readFileSync(
  new URL("../src/hooks/useProductBatchWorkspace.ts", import.meta.url),
  "utf8"
);
equal(hookSource.includes('buildProductBatchEntries(syncedImages, "queued")'), true);
equal(hookSource.includes("syncProductBatchEntries(images, previous)"), true);
equal(hookSource.includes("for (const image of syncedImages)"), true);
equal(hookSource.includes("await runBatchItem(image, syncedStyleImages, snapshot)"), true);
equal(hookSource.includes("return await runBatchItem(syncedImage, syncedStyleImages, snapshot)"), true);
equal(hookSource.includes("downloadAll"), true);
equal(hookSource.includes("downloadProductBatchItems"), true);

const panelSource = readFileSync(
  new URL("../src/components/ProductBatchResultPanel.tsx", import.meta.url),
  "utf8"
);
equal(panelSource.includes("compact"), true);
equal(panelSource.includes("onBatchDownload"), true);
equal(panelSource.includes("批量下载"), true);
equal(panelSource.includes("disabled={completedCount === 0 || !platform}"), true);

const productBatchWorkspaceSource = readFileSync(
  new URL("../src/components/workspace/ProductBatchWorkspacePage.tsx", import.meta.url),
  "utf8"
);
equal(productBatchWorkspaceSource.includes("onBatchDownload={slot.downloadAll}"), true);

const panelStyleSource = readFileSync(
  new URL("../src/styles/product-result-panel.css", import.meta.url),
  "utf8"
);
equal(panelStyleSource.includes("grid-template-columns: repeat(2, minmax(0, 1fr));"), true);
equal(panelStyleSource.includes("@media (max-width: 900px)"), true);
equal(panelStyleSource.includes('flex-direction: column;'), true);
equal(panelStyleSource.includes('margin-right: auto;'), true);
equal(panelStyleSource.includes('white-space: normal;'), true);
equal(panelStyleSource.includes("-webkit-line-clamp: 2;"), true);
