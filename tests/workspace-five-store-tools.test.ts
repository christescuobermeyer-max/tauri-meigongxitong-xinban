import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8",
);
const pages = readFileSync(
  new URL("../src/components/WorkspacePages.tsx", import.meta.url),
  "utf8",
);

for (const slotName of [
  "packageImageSlots",
  "pSignboardSlots",
  "imageEditSlots",
  "dataAnalysisSlots",
]) {
  ok(workspace.includes(slotName), `useGenerationWorkspace 应暴露 ${slotName}`);
  ok(pages.includes(`workspace.${slotName}`), `WorkspacePages 应使用 ${slotName}`);
}

const tools: Array<{ name: string; page: string }> = [
  { name: "usePackageImageWorkspace", page: "PackageImageWorkspacePage" },
  { name: "usePSignboardWorkspace", page: "PSignboardWorkspacePage" },
  { name: "useImageEditWorkspace", page: "ImageEditWorkspacePage" },
  { name: "useDataAnalysisWorkspace", page: "DataAnalysisWorkspacePage" },
];

for (const tool of tools) {
  const matches = workspace.match(new RegExp(tool.name, "g")) ?? [];
  ok(matches.length >= 8, `${tool.name} 应被调用 8 次（每店一次），实际 ${matches.length}`);
  ok(pages.includes(tool.page), `${tool.page} 应作为店铺1-8包装页面渲染`);

  const pageSource = readFileSync(
    new URL(`../src/components/workspace/${tool.page}.tsx`, import.meta.url),
    "utf8",
  );
  for (const label of ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5", "店铺6", "店铺7", "店铺8"]) {
    ok(pageSource.includes(label), `${tool.page} 缺失 ${label}`);
  }
  ok(pageSource.includes("MultiStoreTabs"), `${tool.page} 应使用通用 MultiStoreTabs 组件`);
}

console.log("workspace eight-store tools contract: OK");
