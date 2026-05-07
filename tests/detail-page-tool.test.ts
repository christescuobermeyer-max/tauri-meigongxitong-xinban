import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const tauriStubs = `
let apiCalls = [];
async function uploadImageToOss(req) {
  apiCalls.push({ type: "upload", req });
  return { url: "https://oss.example.com/" + req.file_name, key: req.file_name };
}
async function generateImage(req) { apiCalls.push({ type: "generate", req }); return "detail-base64"; }
export function __getApiCalls() { return apiCalls; }
`;

const ossAssetsStub = `
async function compressAndArchiveGenerated(kind, rawBase64, fileNameStem) {
  apiCalls.push({ type: "archive", kind, fileNameStem });
  return "https://oss.example.com/" + fileNameStem + ".jpg";
}
`;

const retryStub = `
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
`;

const libSource = readFileSync(new URL("../src/lib/detail-page.ts", import.meta.url), "utf8")
  .replace('import { generateImage, uploadImageToOss } from "./tauri";', tauriStubs)
  .replace('import { compressAndArchiveGenerated } from "./oss-assets";', ossAssetsStub)
  .replace('import { runWithAutoRetry } from "./generation-retry";', retryStub)
  .replace('import { safeFileName } from "./utils";', "function safeFileName(input) { return input.trim() || 'shop'; }")
  .replace('import type { GenerationItem, GenerationLine, GenerationStatus, UploadedImage } from "../types";', "");

const libModule = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(libSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText).toString("base64")}`
);

equal(libModule.DETAIL_PAGE_GENERATION_SIZE, "1024x1536");
equal(libModule.DETAIL_PAGE_TYPES.length, 3);
equal(libModule.DETAIL_PAGE_TYPES[0].name, "主KV视觉");
equal(libModule.DETAIL_PAGE_TYPES[1].name, "生活场景");
equal(libModule.DETAIL_PAGE_TYPES[2].name, "工艺展示");

const prompt = libModule.buildDetailPagePrompt({
  shopName: "半山小厨",
  productName: "招牌牛肉饭",
  productOssUrl: "https://oss.example.com/source.jpg",
  pageIndex: 0,
});
ok(prompt.includes("为店铺名：“半山小厨”"));
ok(prompt.includes("产品名称：“招牌牛肉饭”"));
ok(prompt.includes("上传的产品图 OSS URL：https://oss.example.com/source.jpg"));
ok(prompt.includes("生成一份精美好看有吸引力的电商详情页展示图"));
ok(prompt.includes("尺寸为1024x1536"));
ok(prompt.includes("不要加入促销价格、满减信息、二维码、地址、电话、联系方式"));

const entries = libModule.buildDetailPageEntries("queued");
equal(entries.length, 3);
equal(entries[0].item.kind, "detail_page");
equal(entries.every((entry: { item: { status: string } }) => entry.item.status === "queued"), true);

const generatedItem = await libModule.generateDetailPageItem(
  {
    id: "source-a",
    name: "招牌牛肉饭.jpg",
    productName: "招牌牛肉饭",
    productBase64: "source-base64",
    mime: "image/jpeg",
  },
  "半山小厨",
  1,
  "line5"
);
equal(generatedItem.status, "succeeded");
equal(generatedItem.kind, "detail_page");
equal(generatedItem.rawBase64, "detail-base64");
equal(generatedItem.generationLine, "line5");

const apiCalls = libModule.__getApiCalls();
equal(apiCalls[0].type, "upload");
equal(apiCalls[0].req.folder, "uploads");
equal(apiCalls[1].type, "generate");
equal(apiCalls[1].req.api_line, "line5");
equal(apiCalls[1].req.size, "1024x1536");
equal(apiCalls[1].req.product_images[0].startsWith("https://oss.example.com/"), true);
ok(apiCalls[1].req.prompt.includes("第2张详情页"));
ok(apiCalls[1].req.prompt.includes(apiCalls[1].req.product_images[0]));
equal(apiCalls[2].type, "archive");
equal(apiCalls[2].kind, "detail_page");
ok(apiCalls[2].fileNameStem.includes("detail-page-2"));
equal(apiCalls[1].req.size, "1024x1536");

const sidebarSource = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const pagesSource = readFileSync(new URL("../src/components/WorkspacePages.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../src/lib/history.ts", import.meta.url), "utf8");
const adminFilterSource = readFileSync(new URL("../src/lib/admin-log-filters.ts", import.meta.url), "utf8");
const adminDetailSource = readFileSync(new URL("../src/components/admin/AdminGenerationDetail.tsx", import.meta.url), "utf8");
const supabaseSource = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

ok(sidebarSource.includes('key: "detailPage"'));
ok(sidebarSource.includes('label: "详情页生成"'));
ok(sidebarSource.indexOf('key: "detailPage"') > sidebarSource.indexOf('key: "imageEdit"'));
ok(pagesSource.includes('workspace.tab === "detailPage"'));
ok(pagesSource.includes("DetailPagePage"));
ok(workspaceSource.includes(' | "detailPage"'));
ok(workspaceSource.includes("useDetailPageWorkspace"));
ok(workspaceSource.includes('pushHistoryEntry("detail_page", item)'));
ok(historySource.includes('kind === "detail_page"'));
ok(adminFilterSource.includes('detail_page: "详情页"'));
ok(adminDetailSource.includes('"详情页"'));
ok(supabaseSource.includes('"detail_page"'));
ok(schemaSource.includes("'detail_page'"));
ok(readFileSync(new URL("../src-tauri/src/api_validation.rs", import.meta.url), "utf8").includes('"1024x1536"'));
