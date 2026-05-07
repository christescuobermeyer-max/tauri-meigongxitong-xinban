import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const sizeSource = readFileSync(new URL("../src/lib/generation-size.ts", import.meta.url), "utf8")
  .replace(/import type \{[\s\S]*?\} from "\.\.\/types";/, "")
  .replaceAll("export ", "");

const source = readFileSync(new URL("../src/lib/generation-flow.ts", import.meta.url), "utf8")
  .replace(
    /import \{[\s\S]*?\} from "\.\/prompts";/,
    `function buildPosterPrompt() { return "poster prompt"; }
function buildProductPrompt() { return "product prompt"; }
function buildStorefrontPrompt() { return "storefront prompt"; }`
  )
  .replace(
    /import \{ buildActiveAvatarPrompt, resolveAvatarReferenceImages \} from "\.\/avatar-generation";/,
    `function buildActiveAvatarPrompt() { return "avatar prompt"; }
function resolveAvatarReferenceImages() { return []; }`
  )
  .replace(
    /import \{[\s\S]*?\} from "\.\/reference-images";/,
    `function selectPosterReferenceImages() { return []; }
function selectProductUploadReferenceImages() { return []; }
function selectStorefrontReferenceImages() { return []; }`
  )
  .replace('import { resolveGenerationSize } from "./generation-size";', sizeSource)
  .replace(/import type \{[\s\S]*?\} from "\.\.\/types";/, "");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const meituanPlatformSpec = {
  id: "meituan",
  product: { source: { w: 1536, h: 1024 } },
  poster: { sourceLabel: "21:9" },
};

const taobaoPlatformSpec = {
  id: "taobao",
  product: { source: { w: 1024, h: 1024 } },
  poster: { sourceLabel: "21:9" },
};
const item = { kind: "avatar", rawBase64: null, rawDataUrl: null, status: "idle" };

function storefrontSize(line: "line1" | "line2" | "line3" | "line4" | "line5") {
  return module.buildGenerationPayload(
    "storefront",
    "测试店",
    "",
    "meituan",
    meituanPlatformSpec,
    [],
    item,
    item,
    undefined,
    "image",
    "",
    undefined,
    line
  ).size;
}

function productSize(
  line: "line1" | "line2" | "line3" | "line4" | "line5",
  platform: "meituan" | "taobao",
  platformSpec: typeof meituanPlatformSpec
) {
  return module.buildGenerationPayload(
    "product",
    "测试店",
    "测试产品",
    platform,
    platformSpec,
    [],
    item,
    item,
    undefined,
    "image",
    "",
    undefined,
    line
  ).size;
}

equal(storefrontSize("line1"), "1536x1024");
equal(storefrontSize("line2"), "1536x1024");
equal(storefrontSize("line3"), "1536x1024");
equal(storefrontSize("line4"), "16:9");
equal(storefrontSize("line5"), "16:9");

equal(productSize("line1", "meituan", meituanPlatformSpec), "1536x1024");
equal(productSize("line2", "meituan", meituanPlatformSpec), "1536x1024");
equal(productSize("line3", "meituan", meituanPlatformSpec), "1536x1024");
equal(productSize("line4", "meituan", meituanPlatformSpec), "1536x1024");
equal(productSize("line5", "meituan", meituanPlatformSpec), "4:3");

equal(productSize("line1", "taobao", taobaoPlatformSpec), "1024x1024");
equal(productSize("line2", "taobao", taobaoPlatformSpec), "1024x1024");
equal(productSize("line3", "taobao", taobaoPlatformSpec), "1024x1024");
equal(productSize("line4", "taobao", taobaoPlatformSpec), "1024x1024");
equal(productSize("line5", "taobao", taobaoPlatformSpec), "1:1");
