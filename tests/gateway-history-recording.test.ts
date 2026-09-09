import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const gatewaySource = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);
const tauriSource = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const workspaceGenerationSource = readFileSync(
  new URL("../src/lib/workspace-generation.ts", import.meta.url),
  "utf8",
);
const workspaceSessionSource = readFileSync(
  new URL("../src/lib/workspace-session.ts", import.meta.url),
  "utf8",
);
const generationWorkspaceSource = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8",
);

ok(
  gatewaySource.includes("shop_name: Option<String>"),
  "网关归档请求应携带原始店铺名用于写 generation_logs",
);
ok(
  gatewaySource.includes("platform: Option<String>"),
  "网关归档请求应携带平台用于写 generation_logs",
);
ok(
  gatewaySource.includes("record_generation_log("),
  "网关应在生成图 OSS 归档成功后写入 generation_logs",
);
ok(
  gatewaySource.includes("history_recorded"),
  "网关响应应告诉前端历史记录是否已由网关写入",
);
ok(
  gatewaySource.includes("history_error"),
  "网关响应应携带历史写入失败原因，便于前端兜底写库",
);
ok(
  gatewaySource.includes("oss_key"),
  "网关写 generation_logs 时应保存 OSS key，便于后续对账",
);

ok(
  tauriSource.includes("history_recorded"),
  "前端网关响应类型应读取 history_recorded",
);
ok(
  tauriSource.includes("historyRecorded"),
  "前端内部结果应保留网关已写库标记",
);
ok(
  workspaceGenerationSource.includes("shop_name: shopName"),
  "通用生图流程应把店铺名传给网关归档请求",
);
ok(
  workspaceGenerationSource.includes("platform"),
  "通用生图流程应把平台传给网关归档请求",
);
ok(
  workspaceSessionSource.includes("historyRecorded"),
  "工作区生成结果应把网关写库标记传递到 GenerationItem",
);
ok(
  generationWorkspaceSource.includes("item.historyRecorded"),
  "统一历史记录入口应识别网关已写库结果，避免重复 insert",
);

console.log("gateway history recording contract: OK");
