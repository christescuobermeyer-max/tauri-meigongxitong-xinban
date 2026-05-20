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
ok(gateway.includes("acquire_generation_permit(&state, req.api_line, &req.size, &user_id).await"), "网关应带账号身份等待服务端队列许可，而不是满载立即失败");
ok(gateway.includes("GatewayGenerationQueue"), "网关应使用服务端 FIFO 队列协调并发");
ok(!gateway.includes('read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 17)'), "默认全局并发上限不应再停留在 17");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE1_LIMIT", 2)'), "line1 默认上限应为 2");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 21)'), "默认全局并发上限应为 21");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_USER_LIMIT", 3)'), "默认单账号生图并发上限应为 3");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE2_LIMIT", 4)'), "line2 默认上限应为 4");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE3_LIMIT", 4)'), "line3 默认上限应为 4");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE4_LIMIT", 4)'), "line4 默认上限应为 4");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE5_LIMIT", 4)'), "line5 默认上限应为 4");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE6_LIMIT", 3)'), "line6 默认上限应为 3");

ok(limiter.includes("release_frees_capacity_for_next_request"), "限流器应覆盖释放容量");
ok(limiter.includes("enforces_global_limit_of_twenty_one_active_generations"), "限流器应覆盖全局 21 并发");
ok(limiter.includes("enforces_line_specific_limits"), "限流器应覆盖线路上限");
ok(queue.includes("waits_for_capacity_in_fifo_order_when_all_lines_are_full"), "服务端队列应覆盖满载后按提交顺序释放");
ok(queue.includes("lets_other_users_run_when_front_user_is_at_limit"), "服务端队列应覆盖账号级公平调度");
ok(queue.includes("enforces_configured_user_limit"), "服务端队列应覆盖单账号并发上限");
ok(queue.includes("VecDeque"), "服务端队列应保留 FIFO 等待顺序");
ok(queue.includes("Notify"), "服务端队列应在容量释放后唤醒等待请求");
ok(queue.includes("notify_waiters"), "服务端队列应主动通知等待请求重新检查容量");
ok(threePieceWorkspace.includes("busy"), "各店铺 slot 应暴露忙态用于前端账号并发计数");
ok(workspacePages.includes("generationTaskLimit"), "前端应暴露账号并发上限用于提示");
ok(workspacePages.includes("activeGenerationTaskCount"), "前端应暴露当前账号运行中的任务数用于提示");
ok(workspacePages.includes("generationCapacityFull"), "前端应基于账号并发容量禁用新的提交");
ok(workspacePages.includes("当前账号已有"), "账号并发满载时前端应提示用户等待");

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
    new RegExp(`<${page}[\\s\\S]*globalBusy=\\{workspace\\.generationCapacityFull\\}`).test(workspacePages),
    `${page} 应只在账号并发满载时禁用新的提交`
  );
}

for (const page of [
  "PSignboardWorkspacePage",
  "ImageEditWorkspacePage",
  "DataAnalysisWorkspacePage",
  "PatrolScriptWorkspacePage",
]) {
  ok(
    new RegExp(`<${page}[\\s\\S]*globalBusy=\\{workspace\\.generationCapacityFull\\}`).test(workspacePages),
    `${page} 应只在账号并发满载时禁用新的提交`
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
