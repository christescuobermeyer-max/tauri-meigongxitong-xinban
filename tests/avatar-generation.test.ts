import { deepEqual, equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/avatar-generation.ts", import.meta.url), "utf8")
  .replace(
    'import { buildAvatarCategoryPrompt, buildAvatarPrompt } from "./prompts";',
    `function buildAvatarCategoryPrompt(shopName, category) {
  return \`输入的店铺名：\${shopName}。店铺经营品类：\${category}。请参考输入的店铺名、店铺经营品类和上传的产品图中的食物，为这个店铺设计生成一张醒目且极具冲击力的广告电商头像logo图，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。头像内容必须紧扣上传的产品图中的食物主体和该店铺经营品类，不能脱离上传的食物另起炉灶。画面必须为1:1正方形构图，铺满整个正方形画面，不要圆形边框，不要圆形徽章，不要圆形裁切，内容需覆盖全部页面\`;
}
function buildAvatarPrompt(shopName) {
  return \`输入的店铺名：\${shopName}。请参考输入的店铺名和上传的产品图，为这个店铺设计生成一张醒目且极具冲击力的广告电商头像logo图，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。画面必须为1:1正方形构图，铺满整个正方形画面，不要圆形边框，不要圆形徽章，不要圆形裁切，内容需覆盖全部页面\`;
}`
  )
  .replace(
    'import { selectAvatarReferenceImages } from "./reference-images";',
    "function selectAvatarReferenceImages(images) { return images; }"
  )
  .replace('import type { AvatarReferenceMode, UploadedImage } from "../types";', "");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

equal(
  module.getAvatarGenerationErrorMessage({
    shopName: "",
    mode: "category",
    category: "",
    images: [],
  }),
  "请填写店铺名称"
);

equal(
  module.getAvatarGenerationErrorMessage({
    shopName: "鲜椒鸡排",
    mode: "category",
    category: "",
    images: [],
  }),
  "请填写店铺经营品类"
);

equal(
  module.getAvatarGenerationErrorMessage({
    shopName: "鲜椒鸡排",
    mode: "category",
    category: "炸货",
    images: [],
  }),
  "请上传至少 1 张产品图"
);

equal(
  module.getAvatarGenerationErrorMessage({
    shopName: "鲜椒鸡排",
    mode: "category",
    category: "炸货",
    images: [{ id: "1" }],
  }),
  null
);

deepEqual(module.resolveAvatarReferenceImages("category", []), []);
deepEqual(
  module.resolveAvatarReferenceImages("image", [
    { productOssUrl: "https://example.com/product.jpg", base64: "abc" },
  ]),
  ["https://example.com/product.jpg"]
);

const categoryPrompt = module.buildActiveAvatarPrompt({
  shopName: "鲜椒鸡排",
  mode: "category",
  category: "炸货",
});
equal(categoryPrompt.includes("店铺经营品类：炸货"), true);
equal(categoryPrompt.includes("上传的产品图中的食物"), true);

const imagePrompt = module.buildActiveAvatarPrompt({
  shopName: "鲜椒鸡排",
  mode: "image",
  category: "炸货",
});
equal(imagePrompt.includes("上传的产品图"), true);
equal(imagePrompt.includes("店铺经营品类：炸货"), true);
