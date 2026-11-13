import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeAnimationShowcase } from "../src/lib/animation-showcase";
import { animationTitle } from "../src/lib/product-animation/upload";
import { listWorkspaceNavigation, WORKSPACE_CATALOG } from "../src/lib/workspace-catalog";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Sidebar: 动图展示 sits right below 图片广场 for every account.
for (const admin of [true, false]) {
  const keys = listWorkspaceNavigation(admin).map((item) => item.key);
  equal(keys.indexOf("animationShowcase"), keys.indexOf("imagePlaza") + 1, "动图展示应紧跟在图片广场下方");
}
equal(WORKSPACE_CATALOG.animationShowcase.title, "动图展示");
const pages = read("src/components/WorkspacePages.tsx");
ok(pages.includes('workspace.tab === "animationShowcase"') && pages.includes("<AnimationShowcasePage />"));
ok(read("src/lib/animation-showcase.ts").includes("/api/animation-showcase"));

// Gateway response → page model, with safe fallbacks and page clamping.
const page = normalizeAnimationShowcase({ page: 15, page_size: 12, page_count: 40, visible_total_count: 120, items: [
  { id: "a", display_name: "", title: "", format: "gif", width: 768, height: 576, duration_ms: 3000, frames: 60, bytes: 2_400_000, url: "u", poster_url: "p", created_at: "t" },
] });
equal(page.pageCount, 10);
equal(page.page, 10);
deepEqual(page.items[0], { id: "a", displayName: "未知账号", title: "视频动图", format: "gif", width: 768, height: 576, durationMs: 3000, frames: 60, bytes: 2_400_000, url: "u", posterUrl: "p", createdAt: "t" });

// Titles drop media extensions only.
equal(animationTitle("IMG_2041.MOV"), "IMG_2041");
equal(animationTitle("招牌牛肉面.png"), "招牌牛肉面");
equal(animationTitle("抖音 · 价格12.99"), "抖音 · 价格12.99");
