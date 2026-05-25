import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/lib/workspace-generation.ts", import.meta.url),
  "utf8"
)
  .replace(
    'import { archiveGeneratedImage } from "./oss-assets";',
    `
let failArchive = false;
let localArchiveCalls = 0;
async function archiveGeneratedImage(kind, shopName, rawBase64) {
  localArchiveCalls += 1;
  if (failArchive) {
    failArchive = false;
    throw new Error("OSS archive failed");
  }
  return "https://oss.example.com/generated/" + kind + ".png";
}
export function __failNextArchive() { failArchive = true; }
export function __getLocalArchiveCalls() { return localArchiveCalls; }
`
  )
  .replace(
    'import { buildGenerationPayload } from "./generation-flow";',
    `
function buildGenerationPayload() {
  return { prompt: "测试提示词", size: "1024x1024", productImages: ["https://oss.example.com/source.jpg"] };
}
`
  )
  .replace(
    'import { generateArchivedImageWithLine, generateImageWithLine, getBackendGatewayUrl } from "./tauri";',
    `
let failGatewayArchive = false;
let generateCalls = [];
function getBackendGatewayUrl() { return "https://gateway.example.com"; }
async function generateImageWithLine(req) {
  generateCalls.push({ type: "local-generate", req });
  return { image: "generated-base64", generationLine: "line2" };
}
async function generateArchivedImageWithLine(req, archive) {
  generateCalls.push({ type: "gateway-generate", req, archive });
  if (failGatewayArchive) {
    failGatewayArchive = false;
    return { image: "generated-base64", generationLine: "line2", archiveError: "OSS archive failed" };
  }
  return { image: "generated-base64", generationLine: "line2", archiveUrl: "https://oss.example.com/generated/product.jpg" };
}
export function __failNextGatewayArchive() { failGatewayArchive = true; }
export function __getGenerateCalls() { return generateCalls; }
`
  )
  .replace(
    'import { safeFileName } from "./utils";',
    'function safeFileName(input) { return input.trim() || "shop"; }'
  )
  .replace(/import type \{[\s\S]*?\} from "\.\.\/types";/, "");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const module = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);

const options = {
  kind: "product",
  shopName: "测试店铺",
  productName: "测试产品",
  platform: "meituan",
  currentPlatform: {},
  sourceImages: [],
  avatar: { kind: "avatar", rawBase64: null, rawDataUrl: null, status: "idle" },
  storefront: { kind: "storefront", rawBase64: null, rawDataUrl: null, status: "idle" },
  generationLine: "line1",
};

const generated = await module.generateAsset(options);
equal(generated.remoteUrl, "https://oss.example.com/generated/product.jpg");
equal(module.__getLocalArchiveCalls(), 0);
const calls = module.__getGenerateCalls();
equal(calls[0].type, "gateway-generate");
equal(calls[0].archive.asset_kind, "product");
equal(calls[0].archive.file_name_stem, "测试店铺-product");

module.__failNextGatewayArchive();
const archiveFailed = await module.generateAsset(options);
equal(archiveFailed.rawBase64, "generated-base64");
equal(archiveFailed.remoteUrl, "");
equal(module.__getLocalArchiveCalls(), 0);
