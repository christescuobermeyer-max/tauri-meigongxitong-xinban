import { equal, ok } from "node:assert/strict";
import { readProjectFile as readFileSync } from "./helpers/source-tree.mjs";
import ts from "typescript";

const promptConfigSource = readFileSync(
  new URL("../src/lib/prompt-config.ts", import.meta.url),
  "utf8"
).replace('import type { AppearanceOptions, AssetKind, AvatarReferenceMode, Platform } from "../types";', "")
  .replace('import type { ImageEditKind } from "./image-edit";', "");
const promptConfigModule = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(promptConfigSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText).toString("base64")}`
);

const productConfig = promptConfigModule.buildProductPromptConfig({
  shopName: "测试店",
  productName: "牛肉饭",
  platform: "meituan",
  appearance: { themeColor: "red", brandStyle: "fresh" },
});
equal(productConfig.key, "product.single");
equal(productConfig.variables.shopName, "测试店");
equal(productConfig.variables.productName, "牛肉饭");
equal(productConfig.variables.includeProductName, true);
equal(productConfig.variables.themeColor, "red");

const batchBowlConfig = promptConfigModule.buildProductBatchPromptConfig({
  shopName: "测试店", productName: "牛肉饭", platform: "meituan", matchReferenceBowl: true,
});
equal(batchBowlConfig.variables.matchReferenceBowl, true);
const batchDefaultConfig = promptConfigModule.buildProductBatchPromptConfig({
  shopName: "测试店", productName: "牛肉饭", platform: "meituan",
});
equal(batchDefaultConfig.variables.matchReferenceBowl, false);

const packageConfig = promptConfigModule.buildPackageImagePromptConfig({
  shopName: "测试套餐店",
  packageImageName: "双人招牌套餐",
  productNames: ["鸡腿饭", "牛肉面"],
  productImageCount: 2,
  platform: "meituan",
});
equal(packageConfig.key, "package.image");
equal(packageConfig.variables.shopName, "双人招牌套餐");
equal(packageConfig.variables.productNames.length, 2);

const avatarConfig = promptConfigModule.buildGenerationPromptConfig({
  kind: "avatar",
  shopName: "头像店",
  platform: "meituan",
  avatarCategory: "炸鸡",
});
equal(avatarConfig.key, "avatar.category");
equal(avatarConfig.variables.category, "炸鸡");

const imageEditConfig = promptConfigModule.buildImageEditPromptConfig({
  kind: "product",
  label: "产品图",
  instruction: "把参考图锅里的菜换成产品图里的菜",
  sourceReferenceUrls: ["https://oss.example.com/product.jpg"],
  optionalReferenceUrls: ["https://oss.example.com/pot.jpg"],
  shopName: "火锅店",
  productName: "牛肉片",
});
equal(imageEditConfig.key, "image_edit");
equal(imageEditConfig.variables.sourceReferenceUrls.length, 1);
equal(imageEditConfig.variables.optionalReferenceUrls.length, 1);

const workspaceGenerationSource = readFileSync(
  new URL("../src/lib/workspace-generation.ts", import.meta.url),
  "utf8"
);
ok(workspaceGenerationSource.includes("prompt_config: remotePromptConfig"));
ok(workspaceGenerationSource.includes("buildGenerationPromptConfig"));

const gatewaySource = readFileSync(
  new URL("../src-tauri/src/gateway_bin/backend_gateway.rs", import.meta.url),
  "utf8"
);
ok(gatewaySource.includes("prompt_config: Option<prompt_templates::PromptRenderRequest>"));
ok(gatewaySource.includes("resolve_gateway_prompt"));
ok(gatewaySource.includes("prompt: resolved_prompt.clone()"));

const templateSource = readFileSync(
  new URL("../prompt-templates/generation-prompts.json", import.meta.url),
  "utf8"
);
const template = JSON.parse(templateSource) as { templates: Record<string, string> };
for (const key of [
  "avatar.image",
  "avatar.category",
  "storefront",
  "poster",
  "product.single",
  "product.batch",
  "package.image",
  "picture_wall",
  "detail_page",
  "p_signboard",
  "data_analysis",
  "brand_story.image",
  "brand_story.system",
  "image_edit",
]) {
  ok(template.templates[key], `缺少云端 prompt 模板：${key}`);
}
ok(template.templates["package.image"].includes("{{shop}}"));
ok(template.templates["package.image"].includes("{{packageNameText}}"));
ok(template.templates["package.image"].includes("不得从文件名自动生成或改写套餐图名称"));
ok(template.templates["product.batch"].includes("{{bowlConsistencyClause}}"));

const updateScript = readFileSync(
  new URL("../docs/cloud-gateway/update.sh", import.meta.url),
  "utf8"
);
ok(updateScript.includes("prompt-templates/generation-prompts.json"));
ok(updateScript.includes("/opt/csgh-gateway/prompts/generation-prompts.json"));
