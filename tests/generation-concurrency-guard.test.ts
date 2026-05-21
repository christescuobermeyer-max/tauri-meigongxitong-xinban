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
const useGenerationWorkspace = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
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

// 网关：FIFO 队列 + 每用户并发限制（账号公平性由服务端兜底）
ok(gateway.includes("acquire_generation_permit"), "网关生图前必须获取限流许可");
ok(gateway.includes("GatewayGenerationQueue"), "网关应使用服务端 FIFO 队列协调并发");
ok(!gateway.includes('read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 17)'), "默认全局并发上限不应再停留在 17");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 21)'), "默认全局并发上限应为 21");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_USER_LIMIT", 3)'), "默认单账号生图并发上限应为 3");
// 各线路默认上限（与上游性价比/稳定性匹配）
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE1_LIMIT", 1)'), "line1 (wlai) 成本高，默认上限应为 1");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE2_LIMIT", 4)'), "line2 默认上限应为 4");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE3_LIMIT", 4)'), "line3 默认上限应为 4");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE4_LIMIT", 4)'), "line4 默认上限应为 4");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE5_LIMIT", 5)'), "line5 (apimart) 最稳，默认上限应为 5");
ok(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE6_LIMIT", 4)'), "line6 (manxiaobai) 稳定，默认上限应为 4");

// 限流器单测覆盖：全局/线路/释放/排除
ok(limiter.includes("release_frees_capacity_for_next_request"), "限流器应覆盖释放容量");
ok(limiter.includes("enforces_global_limit_of_twenty_one_active_generations"), "限流器应覆盖全局 21 并发");
ok(limiter.includes("enforces_line_specific_limits"), "限流器应覆盖线路上限");
ok(limiter.includes("try_acquire_auto_excluding"), "限流器应支持自动路由时排除已试过的线路（retry 用）");

// 队列单测覆盖：FIFO + 账号公平 + 重新评估健康状态
ok(queue.includes("waits_for_capacity_in_fifo_order_when_all_lines_are_full"), "服务端队列应覆盖满载后按提交顺序释放");
ok(queue.includes("lets_other_users_run_when_front_user_is_at_limit"), "服务端队列应覆盖账号级公平调度");
ok(queue.includes("enforces_configured_user_limit"), "服务端队列应覆盖单账号并发上限");
ok(queue.includes("VecDeque"), "服务端队列应保留 FIFO 等待顺序");
ok(queue.includes("Notify"), "服务端队列应在容量释放后唤醒等待请求");
ok(queue.includes("notify_waiters"), "服务端队列应主动通知等待请求重新检查容量");
ok(queue.includes("acquire_auto_for_user_excluding"), "服务端队列应允许同一请求重试时排除已试过的线路");

// 网关 generate_image 必须带 retry 循环（失败自动换线路）
ok(gateway.includes("GENERATE_IMAGE_MAX_ATTEMPTS"), "网关 generate_image 必须有重试上限常量");
ok(gateway.includes("tried_lines"), "网关 generate_image 重试时必须跟踪已试过的线路集合");

// 前端约束：
//   - 保留账号级"前端账号锁"，上限为 10（防止误触一次性几十个请求）
//   - 服务端 GATEWAY_GENERATION_USER_LIMIT=3 的硬限制还在，前端 10 只是 UI 缓冲
//   - 各 slot 仍维护自己的 busy（防止同一 slot 重复点击）
ok(useGenerationWorkspace.includes("FRONTEND_GENERATION_USER_LIMIT = 10"), "前端账号并发上限应为 10");
ok(useGenerationWorkspace.includes("generationCapacityFull"), "前端应暴露 generationCapacityFull 以禁用满载后的提交");
ok(useGenerationWorkspace.includes("generationTaskLimit"), "前端应暴露 generationTaskLimit 以显示进度");
ok(workspacePages.includes("CapacityNotice"), "WorkspacePages 应渲染账号并发满载提示");
ok(workspacePages.includes("当前账号已有"), "账号并发满载时前端应提示用户等待");
ok(/globalBusy=\{workspace\.generationCapacityFull\}/.test(workspacePages), "WorkspacePages 应向工作区透传 globalBusy");

// 各 slot 仍需 busy 字段供 UI 显示本 slot 状态
ok(threePieceWorkspace.includes("busy"), "各店铺 slot 应暴露忙态用于本 slot 的 UI 状态展示");

// submitDisabled 仍是统一入口（即使现在只看本 slot 的 busy）
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
