import { equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const promptsSource = readFileSync(
  new URL("../src/lib/prompts.ts", import.meta.url),
  "utf8"
);
const promptsTranspiled = ts.transpileModule(promptsSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const promptsModule = await import(
  `data:text/javascript;base64,${Buffer.from(promptsTranspiled).toString("base64")}`
);

equal(typeof promptsModule.buildProductBatchPrompt, "function");

const batchPrompt = promptsModule.buildProductBatchPrompt("鲜椒鸡排", "招牌牛肉汉堡", "meituan");
ok(batchPrompt.includes("输入的店铺名：鲜椒鸡排"));
ok(batchPrompt.includes("产品名称：招牌牛肉汉堡"));
ok(batchPrompt.includes("第1张传给系统的参考图为参考设计风格图"));
ok(batchPrompt.includes("第2张传给系统的参考图为当前需要生成的产品图"));
ok(batchPrompt.includes("这里的第1张和第2张只代表本次单张生成请求中的两张参考图"));
ok(batchPrompt.includes("不是产品图列表中的第1张或第2张"));
ok(batchPrompt.includes("每次只从产品图列表中取当前正在生成的这一张产品图"));
ok(batchPrompt.includes("以第1张参考设计风格图作为最终画面的版式模板"));
ok(batchPrompt.includes("保留第1张图的背景氛围、构图结构、光影层次、配色方向和文案排版位置"));
ok(batchPrompt.includes("把第2张产品图中的真实食物主体替换进第1张图的产品主体位置"));
ok(batchPrompt.includes("必须保留第2张图中的真实产品主体"));
ok(batchPrompt.includes("店铺名“鲜椒鸡排”"));
ok(batchPrompt.includes("产品名称“招牌牛肉汉堡”"));
ok(batchPrompt.includes("横版产品图"));

const sidebarSource = readFileSync(
  new URL("../src/components/Sidebar.tsx", import.meta.url),
  "utf8"
);
equal(sidebarSource.includes('label: "制作1张设计图"'), true);
equal(sidebarSource.includes('label: "制作全店图"'), true);

const batchPanelUrl = new URL("../src/components/ProductBatchGeneratePanel.tsx", import.meta.url);
const batchPanelExists = existsSync(batchPanelUrl);
equal(batchPanelExists, true);

const batchPanelSource = batchPanelExists ? readFileSync(batchPanelUrl, "utf8") : "";
equal(batchPanelSource.includes("参考设计风格图"), true);
equal(batchPanelSource.includes("maxCount={10}"), true);
equal(batchPanelSource.includes("每次生成只发送 1 张参考设计风格图 + 当前这一张产品图"), true);
equal(batchPanelSource.includes("不是产品图列表的第 1 张、第 2 张"), true);
equal(batchPanelSource.includes("buildProductBatchPrompt"), false);
equal(batchPanelSource.includes("传给系统的参考图"), true);
equal(batchPanelSource.includes("传给模型的参考图"), false);
equal(
  batchPanelSource.indexOf("参考设计风格图") < batchPanelSource.indexOf("产品图（参考素材）"),
  true
);
