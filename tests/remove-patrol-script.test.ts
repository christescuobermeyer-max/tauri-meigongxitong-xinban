import { equal } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const sidebarSource = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8",
);
const pagesSource = readFileSync(
  new URL("../src/components/WorkspacePages.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("../src/components/WorkspaceShell.tsx", import.meta.url),
  "utf8",
);

for (const source of [sidebarSource, workspaceSource, pagesSource, shellSource]) {
  equal(source.includes("巡店话术"), false);
  equal(source.includes("patrolScript"), false);
  equal(source.includes("PatrolScript"), false);
}

for (const file of [
  "../src/components/PatrolScriptPage.tsx",
  "../src/components/workspace/PatrolScriptWorkspacePage.tsx",
  "../src/hooks/usePatrolScriptWorkspace.ts",
  "../src/lib/patrol-script.ts",
  "../src/lib/patrol-scripts.ts",
  "../src/styles/patrol-script.css",
]) {
  equal(existsSync(new URL(file, import.meta.url)), false, `${file} 应已移除`);
}
