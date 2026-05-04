import { deepEqual, equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/generated-asset-files.ts", import.meta.url), "utf8")
  .replace(
    'import { safeFileName } from "./utils";',
    `function safeFileName(input) {
  return input.replace(/[\\\\/:*?"<>|]/g, "_").trim() || "shop";
}`
  );

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const {
  buildBatchDownloadPlans,
  canBatchDownloadAssets,
  getGeneratedAssetExportSpec,
} = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const platform = {
  id: "meituan",
  label: "美团",
  avatar: { w: 512, h: 512 },
  storefront: { w: 686, h: 320 },
  poster: {
    sourceLabel: "21:9",
    export: { w: 720, h: 240 },
  },
  product: {
    source: { w: 1536, h: 1024 },
    export: { w: 600, h: 450 },
    maxBytes: 500 * 1024,
  },
  swatch: "#ff7a00",
};

function succeeded(kind: "avatar" | "storefront" | "poster" | "product", rawBase64 = "abc") {
  return {
    kind,
    rawBase64,
    rawDataUrl: `data:image/png;base64,${rawBase64}`,
    status: "succeeded",
  };
}

equal(
  canBatchDownloadAssets([
    succeeded("avatar"),
    succeeded("storefront"),
    succeeded("poster"),
  ]),
  true
);

equal(
  canBatchDownloadAssets([
    succeeded("avatar"),
    { ...succeeded("storefront"), status: "failed" },
    succeeded("poster"),
  ]),
  false
);

const plans = buildBatchDownloadPlans(
  {
    avatar: succeeded("avatar", "a1"),
    storefront: succeeded("storefront", "s1"),
    poster: succeeded("poster", "p1"),
  },
  "阿牛黄焖鸡米饭（火车站店）",
  platform,
  "C:\\Exports"
);

equal(plans.length, 3);
deepEqual(
  plans.map((item) => ({
    kind: item.kind,
    outputPath: item.outputPath,
    size: `${item.targetWidth}x${item.targetHeight}`,
    maxBytes: item.maxBytes ?? null,
  })),
  [
    {
      kind: "avatar",
      outputPath: "C:\\Exports\\阿牛黄焖鸡米饭（火车站店）_meituan_avatar_512x512.png",
      size: "512x512",
      maxBytes: null,
    },
    {
      kind: "storefront",
      outputPath: "C:\\Exports\\阿牛黄焖鸡米饭（火车站店）_meituan_storefront_686x320.png",
      size: "686x320",
      maxBytes: null,
    },
    {
      kind: "poster",
      outputPath: "C:\\Exports\\阿牛黄焖鸡米饭（火车站店）_meituan_poster_720x240.png",
      size: "720x240",
      maxBytes: null,
    },
  ]
);

const productSpec = getGeneratedAssetExportSpec(
  "product",
  "阿牛黄焖鸡米饭（火车站店）",
  platform,
  "招牌鸡排饭"
);

equal(productSpec.fileName, "招牌鸡排饭.jpg");
