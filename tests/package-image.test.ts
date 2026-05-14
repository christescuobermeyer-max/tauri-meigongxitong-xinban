import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const root = new URL("../", import.meta.url);

function read(path: string) {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

function loadModule(source: string) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const packageImageSource = read("src/lib/package-image.ts")
  .replace('import type { Platform, UploadedImage } from "../types";', "");
const packageImageModule = await loadModule(packageImageSource);

equal(typeof packageImageModule.buildPackageImagePrompt, "function");
equal(typeof packageImageModule.resolvePackageImageReferences, "function");

const prompt = packageImageModule.buildPackageImagePrompt({
  shopName: "套餐小馆",
  productNames: ["鸡腿饭", "牛肉面", "炸鸡", "小食拼盘"],
  platform: "meituan",
});

ok(prompt.includes("第1张传给系统的参考图为参考设计风格图"));
ok(prompt.includes("第2张到第5张传给系统的参考图为需要同时融入套餐图的产品图"));
ok(prompt.includes("所有上传产品图中的真实食物主体"));
ok(prompt.includes("同一张套餐图"));
ok(prompt.includes("不能遗漏任何一张产品图"));
ok(prompt.includes("不要要求用户手动输入描述文字"));
ok(prompt.includes("横版产品图"));

deepEqual(
  packageImageModule.resolvePackageImageReferences(
    [{ productOssUrl: "https://oss.example.com/style.jpg" }],
    [
      { productOssUrl: "https://oss.example.com/a.jpg" },
      { productBase64: "b-base64" },
      { base64: "c-base64" },
      { productOssUrl: "https://oss.example.com/d.jpg" },
    ]
  ),
  [
    "https://oss.example.com/style.jpg",
    "https://oss.example.com/a.jpg",
    "b-base64",
    "c-base64",
    "https://oss.example.com/d.jpg",
  ]
);

equal(
  packageImageModule.resolvePackageImageProductName([
    { productName: "鸡腿饭" },
    { productName: "牛肉面" },
  ]),
  "鸡腿饭、牛肉面套餐图"
);

const sidebarSource = read("src/components/Sidebar.tsx");
ok(sidebarSource.includes('key: "packageImage"'), "侧边栏应包含制作套餐图入口");
ok(sidebarSource.includes('label: "制作套餐图"'), "侧边栏应显示制作套餐图");
ok(
  sidebarSource.indexOf('key: "packageImage"') > sidebarSource.indexOf('key: "productBatch"'),
  "制作套餐图应放在制作全店图下方"
);
ok(
  sidebarSource.indexOf('key: "packageImage"') < sidebarSource.indexOf('key: "pictureWall"'),
  "制作套餐图应放在图片墙前方"
);

const workspaceSource = read("src/hooks/useGenerationWorkspace.ts");
ok(workspaceSource.includes(' | "packageImage"'), "工作区类型应包含 packageImage");
ok(workspaceSource.includes("usePackageImageWorkspace"), "工作区应接入套餐图 hook");
ok(workspaceSource.includes("packageImage.busy"), "全局忙碌状态应包含套餐图");
ok(workspaceSource.includes("packageImage,"), "工作区返回值应包含套餐图状态");

const pagesSource = read("src/components/WorkspacePages.tsx");
ok(pagesSource.includes('workspace.tab === "packageImage"'), "页面路由应包含套餐图");
ok(pagesSource.includes("PackageImageWorkspacePage"), "页面路由应渲染套餐图页面");

const shellSource = read("src/components/WorkspaceShell.tsx");
ok(shellSource.includes('"制作套餐图"'), "顶部标题应支持制作套餐图");

const packagePageSource = read("src/components/PackageImagePage.tsx");
ok(packagePageSource.includes("制作套餐图"), "套餐图页面标题应正确");
ok(packagePageSource.includes("maxCount={4}"), "产品图最多 4 张");
ok(packagePageSource.includes("maxCount={1}"), "参考图最多 1 张");
equal(packagePageSource.includes("<textarea"), false, "套餐图不应要求手动输入描述文字");
ok(packagePageSource.includes("开始制作套餐图"), "套餐图应有独立生成按钮");

const apiValidationSource = read("src-tauri/src/api_validation.rs");
equal(
  apiValidationSource.includes("Line5 && req.product_images.len() > 4"),
  false,
  "线路5需要允许 1 张风格图 + 4 张产品图"
);
ok(apiValidationSource.includes("allow_five_reference_images_for_apimart"));
