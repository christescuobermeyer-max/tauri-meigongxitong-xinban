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
const provider = readFileSync(
  new URL("../src-tauri/src/image_provider.rs", import.meta.url),
  "utf8",
);
const tauri = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const workspaceGeneration = readFileSync(
  new URL("../src/lib/workspace-generation.ts", import.meta.url),
  "utf8",
);
const lineCard = readFileSync(
  new URL("../src/components/GenerationLineCard.tsx", import.meta.url),
  "utf8",
);
const topbar = readFileSync(
  new URL("../src/components/TopBarStatus.tsx", import.meta.url),
  "utf8",
);

ok(provider.includes('serde(rename = "auto")'), "Rust 生图线路枚举应支持 auto 入参");
ok(gateway.includes("acquire_auto_generation_permit"), "网关应有自动分配线路的许可入口");
ok(limiter.includes("select_generation_line"), "网关限流器应在同一把锁内选择并占用线路");
ok(gateway.includes("state.line_health.snapshot()"), "网关自动选线应读取线路健康状态");
ok(gateway.includes("req.api_line = permit.line"), "网关调用生图接口前应把 auto 替换成实际线路");
ok(gateway.includes("state.line_health.record(line"), "网关应按实际线路记录健康样本");

for (const line of ["line2", "line3", "line4", "line5", "line6"]) {
  ok(limiter.includes(`"${line}"`), `自动分配候选应包含 ${line}`);
}
ok(
  limiter.includes('AUTO_GENERATION_LINES: [&str; 5] = ["line2", "line3", "line4", "line5", "line6"]'),
  "自动分配不应包含线路1"
);
ok(limiter.includes("supports_generation_size"), "自动分配应按请求尺寸筛掉不兼容线路");
ok(limiter.includes("LineHealthStatus::Red"), "自动分配应参考红色健康状态并降级或排除");
ok(limiter.includes("active_by_line"), "自动分配应优先考虑当前线路占用数");

ok(tauri.includes('api_line?: GenerationLine | "auto"'), "前端网关请求类型应允许 auto");
ok(workspaceGeneration.includes('api_line: "auto"'), "通用生图请求应交给网关自动分配线路");
ok(!lineCard.includes("GenerationLineSelect"), "线路状态卡不应再渲染手动线路切换器");
ok(lineCard.includes("<LineHealthBar />"), "线路状态卡应保留线路健康展示");
ok(topbar.includes("自动分配线路"), "顶部状态不应再显示当前手动选择线路");

console.log("gateway auto line routing contract: OK");
