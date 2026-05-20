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

const brandStorySource = readFileSync(
  new URL("../src/lib/brand-story.ts", import.meta.url),
  "utf8"
)
  .replace(
    'import { generateImageWithLine, generateBrandStoryText } from "./tauri";',
    `async function generateImageWithLine() { return { image: "raw", generationLine: "line2" }; }
async function generateBrandStoryText() { return {}; }`
  )
  .replace(
    'import { compressAndArchiveGenerated } from "./oss-assets";',
    `async function compressAndArchiveGenerated() { return "https://oss.example.com/brand-story.png"; }`
  )
  .replace(
    'import { runWithAutoRetry } from "./generation-retry";',
    `async function runWithAutoRetry(options) {
  const result = await options.run();
  return { ...result, attempt: 1 };
}`
  )
  .replace(
    'import { safeFileName } from "./utils";',
    `function safeFileName(input) { return input.trim() || "shop"; }`
  )
  .replace(
    /import type \{[\s\S]*?\} from "\.\.\/types";/,
    ""
  );

const brandStoryModule = await import(
  `data:text/javascript;base64,${Buffer.from(transpile(brandStorySource)).toString("base64")}`
);

deepEqual(
  brandStoryModule.BRAND_STORY_IMAGE_CONFIGS.map(
    (config: { aspectRatio: string; exportSize: { w: number; h: number } }) =>
      `${config.aspectRatio}:${config.exportSize.w}x${config.exportSize.h}`
  ),
  [
    "3:2:1536x1024",
    "16:9:1536x864",
    "4:3:1536x1152",
    "4:3:1536x1152",
    "4:3:1536x1152",
  ]
);

deepEqual(
  brandStoryModule.buildBrandStoryEntries().map(
    (entry: { aspectRatio: string; exportSize: { w: number; h: number } }) =>
      `${entry.aspectRatio}:${entry.exportSize.w}x${entry.exportSize.h}`
  ),
  [
    "3:2:1536x1024",
    "16:9:1536x864",
    "4:3:1536x1152",
    "4:3:1536x1152",
    "4:3:1536x1152",
  ]
);

equal(brandStoryModule.formatBrandStoryExportSize(brandStoryModule.buildBrandStoryEntries()[1]), "1536×864");
equal(brandStoryModule.resolveBrandStorySize("line5"), "3:2");
equal(brandStoryModule.BRAND_STORY_MAX_BYTES, 2 * 1024 * 1024);

const downloadSource = readFileSync(
  new URL("../src/lib/brand-story-download.ts", import.meta.url),
  "utf8"
)
  .replace(
    /import \{[^}]*type BrandStoryImageEntry[^}]*\} from "\.\/brand-story";/,
    `const BRAND_STORY_EXPORT_SIZE = { w: 1536, h: 1024 };
const BRAND_STORY_MAX_BYTES = 2 * 1024 * 1024;
function getBrandStoryExportSize(entry) {
  return entry.exportSize ?? BRAND_STORY_EXPORT_SIZE;
}`
  )
  .replace(
    'import { pickDirectoryPath, pickSavePath, resizeAndSaveImage } from "./tauri";',
    `let resizeCalls = [];
let saveNames = [];
async function pickSavePath(defaultName) {
  saveNames.push(defaultName);
  return "C:\\\\single-output.png";
}
async function pickDirectoryPath() { return "C:\\\\downloads"; }
async function resizeAndSaveImage(req) {
  resizeCalls.push(req);
  return req.output_path;
}
export function __getResizeCalls() { return resizeCalls; }
export function __getSaveNames() { return saveNames; }
export function __reset() {
  resizeCalls = [];
  saveNames = [];
}`
  )
  .replace(
    /import \{ replaceFileExtension, safeFileName \} from "\.\/utils";/,
    `function safeFileName(input) { return input.replace(/[\\\\/:*?"<>|]/g, "_").trim() || "shop"; }
function replaceFileExtension(path, ext) {
  const normalizedExt = ext.startsWith(".") ? ext : "." + ext;
  return path.replace(/\\.[^\\.\\\\/]+$/, "") + normalizedExt;
}`
  );

const downloadModule = await import(
  `data:text/javascript;base64,${Buffer.from(transpile(downloadSource)).toString("base64")}`
);

function succeededEntry(index: number, name: string, aspectRatio: string, w: number, h: number, rawBase64: string) {
  return {
    index,
    name,
    aspectRatio,
    exportSize: { w, h },
    item: {
      kind: "brand_story",
      rawBase64,
      rawDataUrl: `data:image/png;base64,${rawBase64}`,
      status: "succeeded",
    },
  };
}

const entries = [
  succeededEntry(1, "主文案配图", "3:2", 1536, 1024, "raw-1"),
  succeededEntry(2, "品牌特色配图", "16:9", 1536, 864, "raw-2"),
  succeededEntry(3, "细节1配图", "4:3", 1536, 1152, "raw-3"),
  succeededEntry(4, "细节2配图", "4:3", 1536, 1152, "raw-4"),
  succeededEntry(5, "细节3配图", "4:3", 1536, 1152, "raw-5"),
];

await downloadModule.downloadBrandStoryEntry(entries[1], "测试店铺");
deepEqual(
  downloadModule.__getResizeCalls().map((call: { target_width: number; target_height: number; max_bytes?: number }) => [
    call.target_width,
    call.target_height,
    call.max_bytes,
  ]),
  [[1536, 864, 2 * 1024 * 1024]]
);
ok(downloadModule.__getSaveNames()[0].includes("1536x864"));
ok(downloadModule.__getSaveNames()[0].endsWith(".jpg"));
ok(downloadModule.__getResizeCalls()[0].output_path.endsWith(".jpg"));

downloadModule.__reset();
await downloadModule.downloadBrandStoryEntries(entries, "测试店铺");
deepEqual(
  downloadModule.__getResizeCalls().map((call: { target_width: number; target_height: number; max_bytes?: number }) => [
    call.target_width,
    call.target_height,
    call.max_bytes,
  ]),
  [
    [1536, 1024, 2 * 1024 * 1024],
    [1536, 864, 2 * 1024 * 1024],
    [1536, 1152, 2 * 1024 * 1024],
    [1536, 1152, 2 * 1024 * 1024],
    [1536, 1152, 2 * 1024 * 1024],
  ]
);
ok(downloadModule.__getResizeCalls().every((call: { output_path: string }) => call.output_path.endsWith(".jpg")));
