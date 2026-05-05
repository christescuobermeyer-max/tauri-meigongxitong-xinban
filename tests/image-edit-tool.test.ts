import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const libSource = readFileSync(new URL("../src/lib/image-edit.ts", import.meta.url), "utf8")
  .replace('import type { AssetKind, PlatformSpec } from "../types";', "");
const libModule = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(libSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText).toString("base64")}`
);

equal(libModule.IMAGE_EDIT_KINDS.join(","), "avatar,storefront,poster,product");
const prompt = libModule.buildImageEditPrompt({
  kind: "product",
  instruction: "把背景改成暖色，产品主体不变",
  referenceUrl: "https://oss.example.com/source.jpg",
  shopName: "测试店",
  productName: "招牌饭",
});
ok(prompt.includes("上传的产品图 OSS 地址：https://oss.example.com/source.jpg"));
ok(prompt.includes("修改要求：“把背景改成暖色，产品主体不变”"));
ok(prompt.includes("产品名称：“招牌饭”"));

const platform = {
  avatar: { w: 800, h: 800 },
  storefront: { w: 692, h: 390 },
  poster: { sourceLabel: "21:9", export: { w: 720, h: 240 } },
  product: { source: { w: 1536, h: 1024 }, export: { w: 600, h: 450 } },
};
equal(libModule.getImageEditSpec("avatar", platform).exportLabel, "800×800");
equal(libModule.getImageEditSpec("storefront", platform).exportLabel, "692×390");
equal(libModule.getImageEditSpec("poster", platform).sourceLabel, "原图 21:9 横版");
equal(libModule.getImageEditSpec("product", platform).sourceLabel, "原图 1536×1024");

const sidebarSource = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const pagesSource = readFileSync(new URL("../src/components/WorkspacePages.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/hooks/useImageEditWorkspace.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/components/ImageEditPage.tsx", import.meta.url), "utf8");

equal(sidebarSource.includes('key: "pSignboard"'), true);
ok(sidebarSource.indexOf('key: "imageEdit"') > sidebarSource.indexOf('key: "pSignboard"'));
equal(sidebarSource.includes('label: "修改图片"'), true);
equal(pagesSource.includes('workspace.tab === "imageEdit"'), true);
equal(pagesSource.includes("ImageEditPage"), true);
equal(workspaceSource.includes(' | "imageEdit"'), true);
equal(workspaceSource.includes("useImageEditWorkspace"), true);
equal(workspaceSource.includes("handleGenerateImageEdit"), true);
equal(hookSource.includes("ensureUploadedImagesOnOss"), true);
equal(hookSource.includes("referenceImages: [referenceUrl]"), true);
equal(hookSource.includes("saveGeneratedAsset(kind"), true);
equal(pageSource.includes("GenerationLineCard"), true);
equal(pageSource.includes("PlatformSelect"), true);
equal(pageSource.includes("IMAGE_EDIT_KINDS.map"), true);
