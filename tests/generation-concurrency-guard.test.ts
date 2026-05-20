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
const queue = readFileSync(
  new URL("../src-tauri/src/gateway_queue.rs", import.meta.url),
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
ok(gateway.includes("acquire_generation_permit(&state, req.api_line, &req.size).await"), "网关应等待服务端队列许可，而不是满载立即失败");
ok(gateway.includes("GatewayGenerationQueue"), "网关应使用服务端 FIFO 队列协调并发");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 17)'), "默认全局并发上限应为 17");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE1_LIMIT", 2)'), "line1 默认上限应为 2");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE2_LIMIT", 3)'), "line2 默认上限应为 3");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE3_LIMIT", 3)'), "line3 默认上限应为 3");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE4_LIMIT", 3)'), "line4 默认上限应为 3");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE5_LIMIT", 3)'), "line5 默认上限应为 3");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE6_LIMIT", 3)'), "line6 默认上限应为 3");

ok(limiter.includes("release_frees_capacity_for_next_request"), "限流器应覆盖释放容量");
ok(limiter.includes("enforces_global_limit_of_seventeen_active_generations"), "限流器应覆盖全局 17 并发");
ok(limiter.includes("enforces_line_specific_limits"), "限流器应覆盖线路上限");
ok(queue.includes("waits_for_capacity_in_fifo_order_when_all_lines_are_full"), "服务端队列应覆盖满载后按提交顺序释放");
ok(queue.includes("VecDeque"), "服务端队列应保留 FIFO 等待顺序");
ok(queue.includes("Notify"), "服务端队列应在容量释放后唤醒等待请求");
ok(queue.includes("notify_waiters"), "服务端队列应主动通知等待请求重新检查容量");

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

for (const page of [
  "PSignboardWorkspacePage",
  "ImageEditWorkspacePage",
  "DataAnalysisWorkspacePage",
  "PatrolScriptWorkspacePage",
]) {
  ok(
    new RegExp(`<${page}[\\s\\S]*globalBusy=\\{workspace\\.busy\\}`).test(workspacePages),
    `${page} 应接收 workspace.busy 作为全局忙态`
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
