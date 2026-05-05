import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const panelFiles = [
  "../src/components/GeneratePanel.tsx",
  "../src/components/ProductGeneratePanel.tsx",
  "../src/components/ProductBatchGeneratePanel.tsx",
  "../src/components/PictureWallPage.tsx",
];

for (const file of panelFiles) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  equal(source.includes("生成提示词"), false, `${file} 不应展示生成提示词入口`);
  equal(source.includes("PromptPreview"), false, `${file} 不应渲染 PromptPreview`);
  equal(source.includes("showPrompt"), false, `${file} 不应保留提示词查看状态`);
}
