import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function cssBlock(source, selector) {
  const start = source.indexOf(selector);
  ok(start >= 0, `missing selector ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

const cssSource = read("src/styles/global.css");
const stageBlock = cssBlock(cssSource, ".video-signboard-editor__stage");
const videoBlock = cssBlock(cssSource, ".video-signboard-editor__video");
const cropBlock = cssBlock(cssSource, ".video-signboard-crop");

equal(stageBlock.includes("aspect-ratio: 16 / 9"), false);
ok(stageBlock.includes("align-items: center"));
ok(videoBlock.includes("max-height: 600px"));
ok(videoBlock.includes("max-width: 100%"));
ok(videoBlock.includes("width: auto"));
ok(videoBlock.includes("height: auto"));
equal(cropBlock.includes("9999px"), false);

const cropBoxSource = read("src/components/video-signboard/CropBox.tsx");
ok(cropBoxSource.includes("getVideoBounds"));
ok(cropBoxSource.includes("videoRect.width"));
ok(cropBoxSource.includes("videoRect.height"));
