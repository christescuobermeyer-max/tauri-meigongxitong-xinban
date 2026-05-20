import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const gateway = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);
const limiter = readFileSync(
  new URL("../src-tauri/src/gateway_limiter.rs", import.meta.url),
  "utf8",
);
const workspacePages = readFileSync(
  new URL("../src/components/WorkspacePages.tsx", import.meta.url),
  "utf8",
);
const threePieceWorkspace = readFileSync(
  new URL("../src/hooks/useThreePieceWorkspace.ts", import.meta.url),
  "utf8",
);
const pageSources = new Map(
  [
    "GeneratePanel",
    "ProductGeneratePanel",
    "ProductBatchGeneratePanel",
    "PackageImagePage",
    "PictureWallPage",
    "DetailPagePage",
    "BrandStoryPage",
    "PSignboardPage",
    "ImageEditInputCard",
    "DataAnalysisPage",
    "PatrolScriptPage",
  ].map((name) => [
    name,
    readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), "utf8"),
  ])
);

ok(gateway.includes("acquire_generation_permit"), "网关生图前必须获取限流许可");
ok(gateway.includes("StatusCode::TOO_MANY_REQUESTS"), "超限应返回 429");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 6)'), "默认全局并发上限应为 6");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE2_LIMIT", 2)'), "line2 默认上限应为 2");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE3_LIMIT", 2)'), "line3 默认上限应为 2");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE4_LIMIT", 2)'), "line4 默认上限应为 2");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE5_LIMIT", 2)'), "line5 默认上限应为 2");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE6_LIMIT", 2)'), "line6 默认上限应为 2");

ok(limiter.includes("release_frees_capacity_for_next_request"), "限流器应覆盖释放容量");
ok(limiter.includes("enforces_global_limit_of_six_active_generations"), "限流器应覆盖全局 6 并发");
ok(limiter.includes("enforces_line_specific_limits"), "限流器应覆盖线路上限");

for (const page of [
  "ThreePieceWorkspacePage",
  "ProductImageWorkspacePage",
  "ProductBatchWorkspacePage",
  "PackageImageWorkspacePage",
  "PictureWallWorkspacePage",
  "DetailPageWorkspacePage",
  "BrandStoryWorkspacePage",
]) {
  ok(
    new RegExp(`<${page}[\\s\\S]*globalBusy=\\{workspace\\.busy\\}`).test(workspacePages),
    `${page} 应接收 workspace.busy 作为全局忙态`
  );
}

for (const { tab, page, variable } of [
  { tab: "pSignboard", page: "PSignboardPage", variable: "ps" },
  { tab: "imageEdit", page: "ImageEditPage", variable: "ie" },
  { tab: "dataAnalysis", page: "DataAnalysisPage", variable: "da" },
  { tab: "patrolScript", page: "PatrolScriptPage", variable: "ps" },
]) {
  ok(
    new RegExp(
      `workspace\\.tab === "${tab}"[\\s\\S]*<${page}[\\s\\S]*submitDisabled=\\{workspace\\.busy \\|\\| ${variable}\\.busy\\}`
    ).test(workspacePages),
    `${page} 应把同机全局忙态传给提交禁用态`
  );
}

for (const source of pageSources.values()) {
  ok(
    source.includes("submitDisabled") || !source.includes("disabled={!can"),
    "生成入口应使用 submitDisabled 拆分提交锁和本工具忙态"
  );
}

ok(
  threePieceWorkspace.indexOf("queueGenerationItems(getAvatarStorefrontPosterSequence(), setters)") <
    threePieceWorkspace.indexOf("syncedImages = await syncImagesToOss()"),
  "三件套应在 OSS 上传前进入 queued 状态，避免提交空窗"
);

console.log("generation concurrency guard contract: OK");
