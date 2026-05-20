import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const libSource = readFileSync(new URL("../src/lib/p-signboard.ts", import.meta.url), "utf8")
  .replace('import { generateImageWithLine, uploadImageToOss } from "./tauri";', `
const calls = [];
async function uploadImageToOss(req) {
  calls.push({ type: "upload", req });
  return { url: "https://oss.example.com/" + req.file_name, key: req.file_name };
}
async function generateImageWithLine(req) {
  calls.push({ type: "generate", req });
  return { image: "generated-base64", generationLine: req.size === "auto" ? "line5" : "line2" };
}
export function __getCalls() { return calls; }
`)
  .replace('import { compressAndArchiveGenerated } from "./oss-assets";', `
async function compressAndArchiveGenerated(kind, rawBase64, fileNameStem) {
  calls.push({ type: "archive", kind, fileNameStem });
  return "https://oss.example.com/" + fileNameStem + ".jpg";
}
`)
  .replace('import { runWithAutoRetry } from "./generation-retry";', `
async function runWithAutoRetry(options) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    options.onAttempt?.(attempt);
    try {
      const result = await options.run(attempt);
      return { ...result, attempt };
    } catch (error) {
      lastError = error;
      if (attempt === 2) {
        if (error instanceof Error) error.attempt = attempt;
        throw error;
      }
    }
  }
  throw lastError;
}
`)
  .replace(
    'import { resolvePSignboardGenerationSize } from "./generation-size";',
    'function resolvePSignboardGenerationSize(line = "line1") { return line === "line5" ? "auto" : line === "line4" ? "16:9" : "1536x1024"; }'
  )
  .replace('import { safeFileName } from "./utils";', 'function safeFileName(input) { return input.trim() || "shop"; }')
  .replace('import type { GenerationItem, GenerationLine, UploadedImage } from "../types";', "");
const libTranspiled = ts.transpileModule(libSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const libModule = await import(
  `data:text/javascript;base64,${Buffer.from(libTranspiled).toString("base64")}`
);

equal(typeof libModule.buildPSignboardPrompt, "function");
equal(typeof libModule.generatePSignboardItem, "function");

const sourceUrl = "https://oss.example.com/uploads/signboard.jpg";
const prompt = libModule.buildPSignboardPrompt(sourceUrl, "老王餐厅", "呈尚小厨");
equal(
  prompt,
  "将上传的门头图片oss的url https://oss.example.com/uploads/signboard.jpg 中原有文字内容“老王餐厅”替换成新文字内容“呈尚小厨”，其他内容保持不变。"
);

const item = await libModule.generatePSignboardItem(
  {
    id: "a",
    name: "door.jpg",
    productBase64: "source-base64",
    mime: "image/jpeg",
  },
  {
    shopName: "测试店",
    originalText: "老王餐厅",
    newText: "呈尚小厨",
  }
);

equal(item.status, "succeeded");
equal(item.kind, "p_signboard");
equal(item.rawBase64, "generated-base64");
ok(item.rawDataUrl.includes("data:image/png;base64,generated-base64"));
ok(item.remoteUrl.includes("p-signboard"));

const calls = libModule.__getCalls();
// 来源图仍走 uploadImageToOss（只有 1 次，到 uploads/）
equal(calls.filter((call: { type: string }) => call.type === "upload").length, 1);
equal(calls[0].req.folder, "uploads");
equal(calls[1].type, "generate");
equal(calls[1].req.size, "1536x1024");
equal(calls[1].req.api_line, "auto");
equal(calls[1].req.product_images[0].startsWith("https://oss.example.com/"), true);
ok(calls[1].req.prompt.includes(calls[1].req.product_images[0]));
ok(calls[1].req.prompt.includes("原有文字内容“老王餐厅”"));
ok(calls[1].req.prompt.includes("新文字内容“呈尚小厨”"));
// 生成结果走 compressAndArchiveGenerated（archive 类型，p_signboard kind）
equal(calls[2].type, "archive");
equal(calls[2].kind, "p_signboard");
ok(calls[2].fileNameStem.includes("p-signboard"));
equal(item.generationLine, "line2");

await libModule.generatePSignboardItem(
  {
    id: "b",
    name: "door2.jpg",
    productBase64: "source-base64",
    mime: "image/jpeg",
  },
  {
    shopName: "测试店",
    originalText: "旧招牌",
    newText: "新招牌",
    generationLine: "line5",
  }
);
const line5Call = libModule.__getCalls().findLast((call: { type: string }) => call.type === "generate");
equal(line5Call.req.size, "auto");
equal(line5Call.req.api_line, "auto");

const hookSource = readFileSync(new URL("../src/hooks/usePSignboardWorkspace.ts", import.meta.url), "utf8");
equal(hookSource.includes("generatePSignboardItem"), true);
equal(hookSource.includes("onRecordHistory"), true);

const workspaceSource = readFileSync(new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url), "utf8");
equal(workspaceSource.includes("usePSignboardWorkspace"), true);
equal(workspaceSource.includes('"pSignboard"'), true);
equal(workspaceSource.includes('tab !== "history"'), true);
equal(workspaceSource.includes("fetchGenerationLogsPage(userId"), true);
equal(workspaceSource.includes("pSignboard"), true);

const sidebarSource = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
equal(sidebarSource.includes('key: "pSignboard"'), true);
equal(sidebarSource.includes('label: "P门头"'), true);

const shellSource = readFileSync(new URL("../src/components/WorkspacePages.tsx", import.meta.url), "utf8");
equal(shellSource.includes("PSignboardPage"), true);
equal(shellSource.includes('workspace.tab === "pSignboard"'), true);
equal(shellSource.includes("PictureWallTabsPage"), false);
equal(shellSource.includes("onRetry={ps.handleGenerate}"), true);
equal(shellSource.includes("onDownload={ps.handleDownload}"), true);

const pageSource = readFileSync(new URL("../src/components/PSignboardPage.tsx", import.meta.url), "utf8");
equal(pageSource.includes("P门头"), true);
equal(pageSource.includes("maxCount={1}"), true);
equal(pageSource.includes("原有文字内容"), true);
equal(pageSource.includes("新文字内容"), true);
equal(pageSource.includes("上传门头图片"), true);
equal(pageSource.includes("上传的门头图会先归档到 OSS，再作为 image-2 参考图生成。"), false);
equal(pageSource.includes("onReset"), false);
equal(pageSource.includes("IconDownload"), true);
equal(pageSource.includes("下载"), true);
equal(pageSource.includes("重试"), true);

const generatedAssetSource = readFileSync(
  new URL("../src/lib/generated-asset-files.ts", import.meta.url),
  "utf8"
);
equal(generatedAssetSource.includes('kind === "p_signboard"'), true);
equal(generatedAssetSource.includes("p_signboard_1792x1024.png"), true);
