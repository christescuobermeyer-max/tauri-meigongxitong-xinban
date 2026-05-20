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
  "patrolScriptSlots",
]) {
  ok(workspace.includes(slotName), `useGenerationWorkspace 应暴露 ${slotName}`);
  ok(pages.includes(`workspace.${slotName}`), `WorkspacePages 应使用 ${slotName}`);
}

for (const pageName of [
  "PackageImageWorkspacePage",
  "PSignboardWorkspacePage",
  "ImageEditWorkspacePage",
  "DataAnalysisWorkspacePage",
  "PatrolScriptWorkspacePage",
]) {
  ok(pages.includes(pageName), `${pageName} 应作为店铺1-5包装页面渲染`);
}

console.log("workspace five-store tools contract: OK");
