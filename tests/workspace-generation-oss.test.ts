import { rejects, equal } from "node:assert/strict";
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
async function archiveGeneratedImage(kind, shopName, rawBase64) {
  if (failArchive) {
    failArchive = false;
    throw new Error("OSS archive failed");
  }
  return "https://oss.example.com/generated/" + kind + ".png";
}
export function __failNextArchive() { failArchive = true; }
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
    'import { generateImage } from "./tauri";',
    'async function generateImage() { return "generated-base64"; }'
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
equal(generated.remoteUrl, "https://oss.example.com/generated/product.png");

module.__failNextArchive();
await rejects(() => module.generateAsset(options), /OSS archive failed/);
