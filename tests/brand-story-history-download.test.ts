import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function transpile(source: string) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

const source = readFileSync(new URL("../src/lib/history-download.ts", import.meta.url), "utf8")
  .replace(
    'import { DETAIL_PAGE_EXPORT_SIZE } from "./detail-page";',
    "const DETAIL_PAGE_EXPORT_SIZE = { w: 1024, h: 1536 };"
  )
  .replace(
    'import { DATA_ANALYSIS_EXPORT_SIZE } from "./data-analysis";',
    "const DATA_ANALYSIS_EXPORT_SIZE = { w: 1536, h: 1024 };"
  )
  .replace(
    'import { PATROL_SCRIPT_EXPORT_SIZE } from "./patrol-script";',
    "const PATROL_SCRIPT_EXPORT_SIZE = { w: 1024, h: 1536 };"
  )
  .replace(
    /import \{[^}]*\} from "\.\/brand-story";/,
    `const BRAND_STORY_MAX_BYTES = 2 * 1024 * 1024;
const BRAND_STORY_IMAGE_CONFIGS = [
  { index: 1, name: "主文案配图", exportSize: { w: 1536, h: 1024 } },
  { index: 2, name: "品牌特色配图", exportSize: { w: 1536, h: 864 } },
  { index: 3, name: "细节1配图", exportSize: { w: 1536, h: 1152 } },
  { index: 4, name: "细节2配图", exportSize: { w: 1536, h: 1152 } },
  { index: 5, name: "细节3配图", exportSize: { w: 1536, h: 1152 } },
];`
  )
  .replace(
    'import { getGeneratedAssetExportSpec } from "./generated-asset-files";',
    `function getGeneratedAssetExportSpec() {
  return { fileName: "asset.png", targetWidth: 1, targetHeight: 1 };
}`
  )
  .replace(
    'import { PICTURE_WALL_EXPORT_SIZE, PICTURE_WALL_SOURCE_SIZE } from "./picture-wall";',
    `const PICTURE_WALL_EXPORT_SIZE = { w: 240, h: 330 };
const PICTURE_WALL_SOURCE_SIZE = { w: 1536, h: 1024 };`
  )
  .replace(
    'import { getPlatform } from "./platforms";',
    `function getPlatform() {
  return {};
}`
  )
  .replace(
    'import { pickDirectoryPath, pickSavePath, resizeAndSaveImage } from "./tauri";',
    `let resizeCalls = [];
let saveNames = [];
async function pickDirectoryPath() { return "C:\\\\downloads"; }
async function pickSavePath(defaultName) {
  saveNames.push(defaultName);
  return "C:\\\\selected.png";
}
async function resizeAndSaveImage(req) {
  resizeCalls.push(req);
  return req.output_path;
}
export function __getResizeCalls() { return resizeCalls; }
export function __getSaveNames() { return saveNames; }`
  )
  .replace(
    'import { replaceFileExtension, safeFileName } from "./utils";',
    `function safeFileName(input) { return input.replace(/[\\\\/:*?"<>|]/g, "_").trim() || "shop"; }
function replaceFileExtension(path, ext) {
  const normalizedExt = ext.startsWith(".") ? ext : "." + ext;
  return path.replace(/\\.[^\\.\\\\/]+$/, "") + normalizedExt;
}`
  )
  .replace(/import type \{[^}]*\} from "\.\/history";/, "");

const module = await import(`data:text/javascript;base64,${Buffer.from(transpile(source)).toString("base64")}`);

Object.assign(globalThis, {
  fetch: async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }),
  btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
});

const saved = await module.downloadHistoryEntry({
  id: "h1",
  kind: "brand_story",
  title: "品牌故事",
  shopName: "测试店铺",
  remoteUrl: "https://oss.example.com/brand-story-2.jpg",
  platform: "meituan",
  createdAt: "2026-05-15T00:00:00.000Z",
});

deepEqual(saved, ["C:\\selected.jpg"]);
equal(module.__getSaveNames()[0], "测试店铺_品牌故事_2_品牌特色配图_1536x864.jpg");
deepEqual(
  module.__getResizeCalls().map((call: { target_width: number; target_height: number; max_bytes?: number }) => [
    call.target_width,
    call.target_height,
    call.max_bytes,
  ]),
  [[1536, 864, 2 * 1024 * 1024]]
);
ok(module.__getResizeCalls()[0].output_path.endsWith(".jpg"));
