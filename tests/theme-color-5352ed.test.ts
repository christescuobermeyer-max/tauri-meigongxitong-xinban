import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildProductPrompt } from "../src/lib/prompts.js";

const themeColor = "blue" as never;
const pinkThemeColor = "pink" as never;
const deepSeaThemeColor = "deepSea" as never;

const productPrompt = buildProductPrompt("鲜椒鸡排", "招牌鸡排饭", "meituan", {
  themeColor,
});
ok(productPrompt.includes("深蓝主题"));
ok(productPrompt.includes("主背景色"));
ok(productPrompt.includes("#262C75"));
ok(productPrompt.includes("#20245F"));
ok(productPrompt.includes("辅助色"));
ok(productPrompt.includes("#6F77A8"));
ok(productPrompt.includes("食物区域色"));
ok(productPrompt.includes("#F4F0E7"));
ok(productPrompt.includes("外卖品牌头图"));
ok(productPrompt.includes("不要做成霓虹科技风"));
ok(!productPrompt.includes("#5352ed"));
ok(!productPrompt.includes("蓝紫"));

const pinkProductPrompt = buildProductPrompt("鲜椒鸡排", "招牌鸡排饭", "meituan", {
  themeColor: pinkThemeColor,
});
ok(pinkProductPrompt.includes("浅粉色主题配色"));
ok(pinkProductPrompt.includes("低饱和的暖浅粉、奶油粉、樱花粉"));
ok(pinkProductPrompt.includes("#F7D6DC"));
ok(pinkProductPrompt.includes("#FBE5E3"));
ok(pinkProductPrompt.includes("暖白 #FFF7F2"));
ok(pinkProductPrompt.includes("只约束画面背景与环境氛围"));
ok(pinkProductPrompt.includes("不规定文字内容、版式、构图、装饰元素或食物摆放"));
ok(pinkProductPrompt.includes("避免玫红、荧光粉、紫粉"));
ok(!pinkProductPrompt.includes("美味轻食系列"));
ok(!pinkProductPrompt.includes("清爽美味"));
ok(!pinkProductPrompt.includes("人气推荐"));
ok(!pinkProductPrompt.includes("精选食材"));

const deepSeaProductPrompt = buildProductPrompt("鲜活厨房", "招牌套餐", "taobao", {
  themeColor: deepSeaThemeColor,
});
ok(deepSeaProductPrompt.includes("深海冰川蓝主题配色"));
ok(deepSeaProductPrompt.includes("可用于任何菜品，不限定食物品类"));
ok(deepSeaProductPrompt.includes("主色使用深海墨蓝 #062333"));
ok(deepSeaProductPrompt.includes("辅色使用冰川浅青 #BFEAF2"));
ok(deepSeaProductPrompt.includes("冷白 #F5FCFF"));
ok(deepSeaProductPrompt.includes("保留产品主体本身的真实自然色彩"));
ok(deepSeaProductPrompt.includes("不改变真实产品主体、文字内容、版式或构图"));
ok(!deepSeaProductPrompt.includes("生鲜海鲜"));
ok(!deepSeaProductPrompt.includes("刺身"));
ok(!deepSeaProductPrompt.includes("冷鲜食品"));
ok(!deepSeaProductPrompt.includes("橙红色海鲜"));

const appearanceFieldsSource = readFileSync(
  new URL("../src/components/AppearanceFields.tsx", import.meta.url),
  "utf8"
);
ok(appearanceFieldsSource.includes("blue"));
ok(appearanceFieldsSource.includes("深蓝主题色"));
ok(appearanceFieldsSource.includes("pink"));
ok(appearanceFieldsSource.includes("浅粉主题色"));
ok(appearanceFieldsSource.includes("deepSea"));
ok(appearanceFieldsSource.includes("深海冰川主题色"));
ok(!appearanceFieldsSource.includes("#262C75 深蓝主题色"));
ok(!appearanceFieldsSource.includes("bluePurple"));
ok(!appearanceFieldsSource.includes("#5352ed"));
ok(!appearanceFieldsSource.includes("蓝紫"));

const pictureWallSource = readFileSync(
  new URL("../src/lib/picture-wall.ts", import.meta.url),
  "utf8"
)
  .replace('import { generateArchivedImageWithLine, uploadImageToOss } from "./tauri";', "")
  .replace('import { resolveGeneratedArchiveUrl } from "./oss-assets";', "")
  .replace('import { runWithAutoRetry } from "./generation-retry";', "")
  .replace('import { safeFileName } from "./utils";', "function safeFileName(input) { return input.trim() || 'shop'; }")
  .replace(/import type \{[\s\S]*?\} from "\.\.\/types";/, "");

const pictureWallTranspiled = ts.transpileModule(pictureWallSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const pictureWallModule = await import(
  `data:text/javascript;base64,${Buffer.from(pictureWallTranspiled).toString("base64")}`
);

const pictureWallPrompt = pictureWallModule.buildPictureWallPrompt(
  "韩大叔炸鸡拌饭",
  "招牌炸鸡",
  "https://oss.example.com/source.jpg",
  { themeColor }
);
ok(pictureWallPrompt.includes("深蓝主题"));
ok(pictureWallPrompt.includes("主背景色"));
ok(pictureWallPrompt.includes("#262C75"));
ok(pictureWallPrompt.includes("#20245F"));
ok(pictureWallPrompt.includes("辅助色"));
ok(pictureWallPrompt.includes("#6F77A8"));
ok(pictureWallPrompt.includes("食物区域色"));
ok(pictureWallPrompt.includes("#F4F0E7"));
ok(pictureWallPrompt.includes("外卖品牌头图"));
ok(pictureWallPrompt.includes("不要做成霓虹科技风"));
ok(!pictureWallPrompt.includes("#5352ed"));
ok(!pictureWallPrompt.includes("蓝紫"));

const pinkPictureWallPrompt = pictureWallModule.buildPictureWallPrompt(
  "韩大叔炸鸡拌饭",
  "招牌炸鸡",
  "https://oss.example.com/source.jpg",
  { themeColor: pinkThemeColor }
);
ok(pinkPictureWallPrompt.includes("浅粉色主题配色"));
ok(pinkPictureWallPrompt.includes("低饱和的暖浅粉、奶油粉、樱花粉"));
ok(pinkPictureWallPrompt.includes("#F7D6DC"));
ok(pinkPictureWallPrompt.includes("#FBE5E3"));
ok(pinkPictureWallPrompt.includes("暖白 #FFF7F2"));
ok(pinkPictureWallPrompt.includes("只约束画面背景与环境氛围"));
ok(pinkPictureWallPrompt.includes("不规定文字内容、版式、构图、装饰元素或食物摆放"));
ok(!pinkPictureWallPrompt.includes("美味轻食系列"));
ok(!pinkPictureWallPrompt.includes("清爽美味"));
ok(!pinkPictureWallPrompt.includes("人气推荐"));

const deepSeaPictureWallPrompt = pictureWallModule.buildPictureWallPrompt(
  "深海刺身屋",
  "厚切三文鱼",
  "https://oss.example.com/source.jpg",
  { themeColor: deepSeaThemeColor }
);
ok(deepSeaPictureWallPrompt.includes("深海冰川蓝主题配色"));
ok(deepSeaPictureWallPrompt.includes("主色使用深海墨蓝 #062333"));
ok(deepSeaPictureWallPrompt.includes("辅色使用冰川浅青 #BFEAF2"));
