import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const libSource = readFileSync(new URL("../src/lib/image-edit.ts", import.meta.url), "utf8")
  .replace(
    'import { PICTURE_WALL_EXPORT_SIZE, PICTURE_WALL_SOURCE_SIZE } from "./picture-wall";',
    "const PICTURE_WALL_EXPORT_SIZE = { w: 240, h: 330 }; const PICTURE_WALL_SOURCE_SIZE = { w: 1086, h: 1448 };"
  );
const libModule = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(libSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText).toString("base64")}`
);

equal(libModule.IMAGE_EDIT_BATCH_MAX_IMAGES, 20);
equal(libModule.getImageEditSourceMaxCount("avatar", "single"), 1);
equal(libModule.getImageEditSourceMaxCount("product", "single"), 4);
equal(libModule.getImageEditSourceMaxCount("avatar", "batch"), 20);
equal(libModule.getImageEditSourceMaxCount("product", "batch"), 20);

const images = [
  { id: "a", name: "牛肉饭.jpg", productName: "牛肉饭", dataUrl: "data:a" },
  { id: "b", name: "鸡腿饭.jpg", productName: "鸡腿饭", dataUrl: "data:b" },
];
const entries = libModule.buildImageEditBatchEntries("product", images, "queued");
equal(entries.length, 2);
equal(entries[0].productName, "牛肉饭");
equal(entries[1].item.kind, "product");
equal(entries[1].item.status, "queued");

const updated = libModule.applyImageEditBatchEntryUpdate(entries, "b", (previous: any) => ({
  ...previous,
  status: "succeeded",
  rawBase64: "done",
}));
equal(updated[0].item.status, "queued");
equal(updated[1].item.status, "succeeded");
equal(libModule.getImageEditBatchCompletedCount(updated), 1);
equal(libModule.hasBusyImageEditBatchEntries(updated), true);

const synced = libModule.syncImageEditBatchEntries("product", images, updated);
equal(synced[1].item.status, "succeeded");

const prompt = libModule.buildImageEditPrompt({
  kind: "product",
  instruction: "统一换成白底，主体不变",
  referenceUrls: ["https://oss.example.com/beef.jpg"],
  shopName: "批量店",
  productName: "牛肉饭",
  batchIndex: 1,
  batchTotal: 2,
});
ok(prompt.includes("批量逐张修改中的第 1/2 张"));
ok(prompt.includes("只处理当前这一张原图"));
ok(prompt.includes("不要融合、引用或复刻其他批量图片的主体内容"));

deepEqual(
  libModule.resolveImageEditReferences(
    [{ productOssUrl: "https://oss.example.com/source.jpg" }],
    [{ productOssUrl: "https://oss.example.com/style.jpg" }]
  ),
  ["https://oss.example.com/source.jpg", "https://oss.example.com/style.jpg"]
);

const hookSource = readFileSync(new URL("../src/hooks/useImageEditWorkspace.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/components/ImageEditPage.tsx", import.meta.url), "utf8");
const inputCardSource = readFileSync(new URL("../src/components/ImageEditInputCard.tsx", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../src/components/ImageEditResults.tsx", import.meta.url), "utf8");
const workspacePageSource = readFileSync(
  new URL("../src/components/workspace/ImageEditWorkspacePage.tsx", import.meta.url),
  "utf8"
);
const batchDownloadSource = readFileSync(
  new URL("../src/lib/image-edit-batch-download.ts", import.meta.url),
  "utf8"
);

ok(hookSource.includes('useState<ImageEditMode>("single")'), "修改图片默认应保持单张修改");
ok(hookSource.includes('if (mode === "batch")'), "生成入口应按模式分支到批量逻辑");
ok(hookSource.includes("async function generateBatch"), "hook 应实现批量生成");
ok(hookSource.includes("async function runBatchItem"), "hook 应逐张运行批量任务");
ok(hookSource.includes("sourceImages: [sourceImage]"), "批量模式每次只能把当前原图传给模型");
ok(hookSource.includes("batchIndex"), "批量 prompt 应写明当前序号");
ok(hookSource.includes("retryBatchItem"), "批量结果应支持单张重试");
ok(hookSource.includes("downloadBatchAll"), "批量结果应支持批量下载");

ok(pageSource.includes("image-edit-mode-select"), "页面应展示单张/批量模式切换");
ok(pageSource.includes('label: "批量逐张修改"'), "模式切换文案应明确逐张修改");
ok(!pageSource.includes("<ImageEditKindSelect value={activeKind} disabled={busy}"), "生成中仍应允许切换头像/店招/海报/产品图查看对应界面");
ok(pageSource.includes("mode={mode}"), "页面应把模式传给输入区和结果区");
ok(pageSource.includes("onRetryBatchItem"), "页面应接入批量重试回调");

ok(inputCardSource.includes("IMAGE_EDIT_BATCH_MAX_IMAGES"), "输入区应使用统一批量上限");
ok(inputCardSource.includes('mode === "batch"'), "输入区应按批量模式调整上传上限和文案");
ok(inputCardSource.includes("maxCount={sourceMaxCount}"), "上传组件上限应跟随当前模式");
ok(inputCardSource.includes("开始批量修改"), "批量模式按钮文案应明确");

ok(resultsSource.includes("getImageEditBatchCompletedCount"), "结果区应展示批量完成数");
ok(resultsSource.includes("BatchDownloadButton"), "结果区应提供批量下载按钮");
ok(resultsSource.includes("image-edit-batch-grid"), "批量结果应按多卡片网格展示");
ok(resultsSource.includes("onRetryBatchItem(activeKind, entry.sourceImageId)"), "批量卡片应按原图 ID 重试");
ok(resultsSource.includes("onDownloadBatchItem(activeKind, entry.sourceImageId)"), "批量卡片应按原图 ID 下载");

ok(workspacePageSource.includes("mode={ie.mode}"), "工作区应透传当前修改模式");
ok(workspacePageSource.includes("onBatchDownload={ie.downloadBatchAll}"), "工作区应透传批量下载");
ok(workspacePageSource.includes("batchEntries.some"), "店铺标签页状态应识别批量完成结果");

ok(batchDownloadSource.includes("downloadImageEditBatchItems"));
ok(batchDownloadSource.includes("getGeneratedAssetExportSpec"));
ok(batchDownloadSource.includes("PICTURE_WALL_EXPORT_SIZE"));
