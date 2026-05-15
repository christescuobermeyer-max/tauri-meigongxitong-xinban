import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const source = read("src/lib/clipboard-image.ts");
const browserlessSource = source
  .replace('import type { GenerationItem } from "../types";', "")
  .replace("export async function copyGeneratedItemImage", "async function copyGeneratedItemImage")
  .replace("export async function copyImageUrlToClipboard", "async function copyImageUrlToClipboard")
  .replace("export function canCopyGeneratedItemImage", "function canCopyGeneratedItemImage")
  .replace(/export /g, "");
const transpiled = ts.transpileModule(
  `${browserlessSource}
export { base64ToBlob, canCopyGeneratedItemImage, copyGeneratedItemImage, copyImageBlobToClipboard };`,
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }
).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const blob = module.base64ToBlob("aGVsbG8=", "image/png");
equal(blob.type, "image/png");
equal(blob.size, 5);

equal(
  module.canCopyGeneratedItemImage({
    kind: "avatar",
    rawBase64: "abc",
    rawDataUrl: "data:image/png;base64,abc",
    status: "succeeded",
  }),
  true
);
equal(
  module.canCopyGeneratedItemImage({
    kind: "avatar",
    rawBase64: null,
    rawDataUrl: null,
    status: "succeeded",
  }),
  false
);

let copiedType = "";
globalThis.ClipboardItem = class ClipboardItem {
  constructor(items: Record<string, Blob>) {
    copiedType = Object.keys(items)[0];
  }
} as unknown as typeof ClipboardItem;
Object.defineProperty(globalThis.navigator, "clipboard", {
  value: {
    async write(items: ClipboardItem[]) {
      equal(items.length, 1);
    },
  },
  configurable: true,
});
await module.copyImageBlobToClipboard(new Blob(["x"], { type: "image/png" }));
equal(copiedType, "image/png");

const tileSource = read("src/components/GenerationResultTile.tsx");
ok(tileSource.includes("copyGeneratedItemImage"));
ok(tileSource.includes("复制图片"));
ok(tileSource.includes("IconCopy"));
ok(tileSource.includes("canCopyGeneratedItemImage(item)"));

const pictureWallSource = read("src/components/PictureWallResults.tsx");
ok(pictureWallSource.includes("copyGeneratedItemImage"));
ok(pictureWallSource.includes("复制图片"));

const pSignboardSource = read("src/components/PSignboardPage.tsx");
ok(pSignboardSource.includes("copyGeneratedItemImage"));
ok(pSignboardSource.includes("复制图片"));

const historySource = read("src/components/HistoryPanel.tsx");
ok(historySource.includes("copyImageUrlToClipboard"));
ok(historySource.includes("复制"));
