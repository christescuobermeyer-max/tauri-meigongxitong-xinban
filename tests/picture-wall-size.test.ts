import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const tauriStubs = `
let apiCalls = [];
async function uploadImageToOss(req) {
  apiCalls.push({ type: "upload", req });
  return { url: "https://oss.example.com/" + req.file_name, key: req.file_name };
}
async function generateImage(req) { apiCalls.push({ type: "generate", req }); return "abc"; }
export function __getApiCalls() { return apiCalls; }
`;

const libSource = readFileSync(new URL("../src/lib/picture-wall.ts", import.meta.url), "utf8")
  .replace('import { generateImage, uploadImageToOss } from "./tauri";', tauriStubs)
  .replace(
    'import { runWithAutoRetry } from "./generation-retry";',
    "async function runWithAutoRetry(options) { return { ...(await options.run()), attempt: 1 }; }"
  )
  .replace('import { safeFileName } from "./utils";', "function safeFileName(input) { return input.trim() || 'shop'; }")
  .replace('import type { GenerationItem, GenerationLine, GenerationStatus, UploadedImage } from "../types";', "");
const libTranspiled = ts.transpileModule(libSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const libModule = await import(
  `data:text/javascript;base64,${Buffer.from(libTranspiled).toString("base64")}`
);

equal(libModule.PICTURE_WALL_SOURCE_SIZE.w, 1086);
equal(libModule.PICTURE_WALL_SOURCE_SIZE.h, 1448);

for (const line of ["line1", "line2", "line3", "line4", "line5"]) {
  await libModule.generatePictureWallItem(
    {
      id: `retry-${line}`,
      name: "招牌饭.jpg",
      productName: "招牌饭",
      productBase64: "source-base64",
      mime: "image/jpeg",
    },
    "饭鲜享盖码饭",
    line
  );
}

const apiCalls = libModule.__getApiCalls();
const generateCalls = apiCalls.filter((call: { type: string }) => call.type === "generate");
equal(generateCalls.length, 5);
equal(
  generateCalls.every((call: { req: { size: string } }) => call.req.size === "1024x1536" || call.req.size === "3:4"),
  true
);
deepStrictEqual(
  generateCalls.map((call: { req: { size: string } }) => call.req.size),
  ["1024x1536", "1024x1536", "1024x1536", "1024x1536", "3:4"]
);

const pageSource = readFileSync(new URL("../src/components/PictureWallPage.tsx", import.meta.url), "utf8");
equal(pageSource.includes("图片墙 prompt · 3:4"), false);

const validationSource = readFileSync(new URL("../src-tauri/src/api_validation.rs", import.meta.url), "utf8");
ok(validationSource.includes('"1024x1536"'), "Rust image-2 请求校验应允许图片墙 1024x1536 尺寸");

const pockgoFormatSource = readFileSync(
  new URL("../src-tauri/src/pockgo_chat_format.rs", import.meta.url),
  "utf8"
);
ok(
  pockgoFormatSource.includes('"1024x1536" => "2:3"'),
  "线路4 pockgo 图片墙应按 1024x1536 对应的 2:3 比例生成"
);
