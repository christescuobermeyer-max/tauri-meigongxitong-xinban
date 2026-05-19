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

const tools: Array<{ name: string; slots: string; page: string }> = [
  {
    name: "useThreePieceWorkspace",
    slots: "threePieceSlots",
    page: "ThreePieceWorkspacePage",
  },
  {
    name: "useProductImageWorkspace",
    slots: "productImageSlots",
    page: "ProductImageWorkspacePage",
  },
  {
    name: "usePictureWallWorkspace",
    slots: "pictureWallSlots",
    page: "PictureWallWorkspacePage",
  },
  {
    name: "useDetailPageWorkspace",
    slots: "detailPageSlots",
    page: "DetailPageWorkspacePage",
  },
  {
    name: "useBrandStoryWorkspace",
    slots: "brandStorySlots",
    page: "BrandStoryWorkspacePage",
  },
];

for (const tool of tools) {
  // 每个 hook 应在 useGenerationWorkspace 实例化 5 个 slot
  const matches = workspace.match(new RegExp(tool.name, "g")) ?? [];
  ok(matches.length >= 5, `${tool.name} 应被调用 5 次（每店一次），实际 ${matches.length}`);
  ok(workspace.includes(tool.slots), `应导出 ${tool.slots}`);

  // 页面已切换为 workspace page 组件
  ok(pages.includes(tool.page), `WorkspacePages 应引用 ${tool.page}`);
  ok(pages.includes(`<${tool.page}`), `应渲染 <${tool.page}>`);
}

// 各工具页面都应包含 5 个店铺 tab
for (const file of [
  "ThreePieceWorkspacePage.tsx",
  "ProductImageWorkspacePage.tsx",
  "PictureWallWorkspacePage.tsx",
  "DetailPageWorkspacePage.tsx",
  "BrandStoryWorkspacePage.tsx",
]) {
  const src = readFileSync(
    new URL(`../src/components/workspace/${file}`, import.meta.url),
    "utf8",
  );
  for (const label of ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"]) {
    ok(src.includes(label), `${file} 缺失 ${label}`);
  }
  ok(src.includes("MultiStoreTabs"), `${file} 应使用通用 MultiStoreTabs 组件`);
}

// 旧的全局变量应已被清掉
for (const oldName of [
  "workspace.threePiece.",
  "workspace.productImage.",
  "workspace.pictureWall.",
  "workspace.detailPage.",
  "workspace.brandStory.",
]) {
  ok(!pages.includes(oldName), `WorkspacePages 不应再有 ${oldName}`);
}

console.log("multi-store five-tools contract: OK");
