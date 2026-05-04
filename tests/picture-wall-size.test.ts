import { equal, ok } from "node:assert/strict";
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

await libModule.generatePictureWallItem(
  {
    id: "retry-a",
    name: "招牌饭.jpg",
    productName: "招牌饭",
    productBase64: "source-base64",
    mime: "image/jpeg",
  },
  "饭鲜享盖码饭",
  "line2"
);

const apiCalls = libModule.__getApiCalls();
equal(apiCalls[1].type, "generate");
equal(apiCalls[1].req.size, "3:4");

const pageSource = readFileSync(new URL("../src/components/PictureWallPage.tsx", import.meta.url), "utf8");
ok(pageSource.includes("图片墙 prompt · 3:4"));

const apiSource = readFileSync(new URL("../src-tauri/src/api.rs", import.meta.url), "utf8");
ok(apiSource.includes('"3:4"'), "Rust image-2 请求校验应允许图片墙 3:4 尺寸标识");

const pockgoFormatSource = readFileSync(
  new URL("../src-tauri/src/pockgo_chat_format.rs", import.meta.url),
  "utf8"
);
ok(
  pockgoFormatSource.includes('"3:4" => "3:4"'),
  "线路2 pockgo 应把图片墙尺寸明确映射为 3:4，而不是复用 1024x1536 的 2:3"
);
