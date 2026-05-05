import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const tauriStubs = `
let resizeCalls = [];
let apiCalls = [];
async function pickDirectoryPath() { return "C:\\\\downloads"; }
async function resizeAndSaveImage(req) { resizeCalls.push(req); return req.output_path; }
async function uploadImageToOss(req) {
  apiCalls.push({ type: "upload", req });
  return { url: "https://oss.example.com/" + req.file_name, key: req.file_name };
}
async function generateImage(req) { apiCalls.push({ type: "generate", req }); return "abc"; }
export function __getResizeCalls() { return resizeCalls; }
export function __getApiCalls() { return apiCalls; }
`;
const libSource = readFileSync(new URL("../src/lib/picture-wall.ts", import.meta.url), "utf8")
  .replace('import { generateImage, uploadImageToOss } from "./tauri";', tauriStubs)
  .replace('import { generateImage, pickDirectoryPath, resizeAndSaveImage, uploadImageToOss } from "./tauri";', tauriStubs)
  .replace('import { safeFileName } from "./utils";', "function safeFileName(input) { return input.trim() || 'shop'; }")
  .replace('import type { GenerationItem, GenerationLine, GenerationStatus, UploadedImage } from "../types";', "")
  .replace('import type { GenerationItem, GenerationStatus, UploadedImage } from "../types";', "");
const libTranspiled = ts.transpileModule(libSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const libModule = await import(
  `data:text/javascript;base64,${Buffer.from(libTranspiled).toString("base64")}`
);
const downloadSource = readFileSync(
  new URL("../src/lib/picture-wall-download.ts", import.meta.url),
  "utf8"
)
  .replace(
    `import {
  PICTURE_WALL_EXPORT_SIZE,
  PICTURE_WALL_SOURCE_SIZE,
  type PictureWallEntry,
} from "./picture-wall";`,
    `
const PICTURE_WALL_SOURCE_SIZE = { w: 1086, h: 1448 };
const PICTURE_WALL_EXPORT_SIZE = { w: 240, h: 330 };
`
  )
  .replace('import { pickDirectoryPath, resizeAndSaveImage } from "./tauri";', `
let resizeCalls = [];
async function pickDirectoryPath() { return "C:\\\\downloads"; }
async function resizeAndSaveImage(req) { resizeCalls.push(req); return req.output_path; }
export function __getResizeCalls() { return resizeCalls; }
`)
  .replace('import { safeFileName } from "./utils";', "function safeFileName(input) { return input.trim() || 'shop'; }");
const downloadTranspiled = ts.transpileModule(downloadSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const downloadModule = await import(
  `data:text/javascript;base64,${Buffer.from(downloadTranspiled).toString("base64")}`
);

equal(typeof libModule.buildPictureWallPrompt, "function");
equal(typeof libModule.buildPictureWallEntries, "function");
equal(typeof libModule.failPendingPictureWallEntries, "function");

const prompt = libModule.buildPictureWallPrompt(
  "韩大叔炸鸡拌饭",
  "招牌炸鸡",
  "https://oss.example.com/source.jpg"
);
ok(prompt.includes("外卖店铺“韩大叔炸鸡拌饭”"));
ok(prompt.includes("产品名称：“招牌炸鸡”"));
ok(prompt.includes("https://oss.example.com/source.jpg"));
ok(prompt.includes("极具戏剧性的商业食品摄影风格"));
ok(prompt.includes("不要加入促销价格、满减信息、二维码、地址、电话、联系方式"));
ok(libSource.includes("generateImage("));

const entries = libModule.buildPictureWallEntries([
  { id: "a", name: "a.jpg", dataUrl: "data:image/jpeg;base64,a" },
  { id: "b", name: "b.jpg", dataUrl: "data:image/jpeg;base64,b" },
  { id: "c", name: "c.jpg", dataUrl: "data:image/jpeg;base64,c" },
]);
equal(entries.length, 3);
equal(entries[0].item.kind, "picture_wall");
equal(entries.every((entry: { item: { status: string } }) => entry.item.status === "queued"), true);

const stoppedEntries = libModule.failPendingPictureWallEntries(entries, "a", "令牌不可用");
equal(stoppedEntries[0].item.status, "failed");
equal(stoppedEntries[0].item.errorMessage, "令牌不可用");
equal(stoppedEntries[1].item.status, "failed");
equal(stoppedEntries[1].item.errorMessage, "已停止生成：前一张图片生成失败");
equal(stoppedEntries[2].item.status, "failed");
equal(stoppedEntries[2].item.errorMessage, "已停止生成：前一张图片生成失败");

const generatedItem = await libModule.generatePictureWallItem(
  {
    id: "source-a",
    name: "招牌炸鸡.jpg",
    productName: "招牌炸鸡",
    productBase64: "source-base64",
    mime: "image/jpeg",
  },
  "韩大叔炸鸡拌饭",
  "line2"
);
equal(generatedItem.status, "succeeded");
equal(generatedItem.kind, "picture_wall");
equal(generatedItem.rawBase64, "abc");
equal(generatedItem.generationLine, "line2");
const apiCalls = libModule.__getApiCalls();
equal(apiCalls[0].type, "upload");
equal(apiCalls[0].req.folder, "uploads");
equal(apiCalls[1].type, "generate");
equal(apiCalls[1].req.api_line, "line2");
equal(apiCalls[1].req.size, "3:4");
equal(apiCalls[1].req.product_images[0].startsWith("https://oss.example.com/"), true);
ok(apiCalls[1].req.prompt.includes("外卖店铺“韩大叔炸鸡拌饭”"));
ok(apiCalls[1].req.prompt.includes("产品名称：“招牌炸鸡”"));
ok(apiCalls[1].req.prompt.includes(apiCalls[1].req.product_images[0]));
equal(apiCalls[2].type, "upload");
equal(apiCalls[2].req.folder, "generated");

const downloadProgress: Array<{ savedCount: number; totalCount: number; message: string }> = [];
const savedPaths = await downloadModule.downloadPictureWallEntries(
  [
    {
      ...entries[0],
      item: { ...entries[0].item, status: "succeeded", rawBase64: "raw-a" },
    },
    {
      ...entries[1],
      item: { ...entries[1].item, status: "succeeded", rawBase64: "raw-b" },
    },
  ],
  "测试店铺",
  {
    onProgress: (progress: { savedCount: number; totalCount: number; message: string }) =>
      downloadProgress.push(progress),
  }
);
equal(savedPaths.length, 4);
equal(downloadProgress[0].savedCount, 0);
equal(downloadProgress[0].totalCount, 4);
ok(downloadProgress[0].message.includes("正在下载"));
equal(downloadProgress.at(-1)?.savedCount, 4);
ok(downloadProgress.at(-1)?.message.includes("下载完成"));
