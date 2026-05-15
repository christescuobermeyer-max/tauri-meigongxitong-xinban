import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const lineHealthSource = readFileSync(
  new URL("../src/lib/line-health.ts", import.meta.url),
  "utf8",
);
const useLineHealthSource = readFileSync(
  new URL("../src/hooks/useLineHealth.ts", import.meta.url),
  "utf8",
);
const barSource = readFileSync(
  new URL("../src/components/LineHealthBar.tsx", import.meta.url),
  "utf8",
);
const lineCardSource = readFileSync(
  new URL("../src/components/GenerationLineCard.tsx", import.meta.url),
  "utf8",
);
const gatewaySource = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);
const moduleSource = readFileSync(
  new URL("../src-tauri/src/line_health.rs", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("../src/styles/global.css", import.meta.url),
  "utf8",
);

// ---- 后端契约 ----
ok(moduleSource.includes("RING_BUFFER_CAP: usize = 5"));
ok(moduleSource.includes("GREEN_MAX_MS: u64 = 150_000"));
ok(moduleSource.includes("YELLOW_MAX_MS: u64 = 350_000"));
ok(moduleSource.includes("LineHealthRegistry"));
ok(moduleSource.includes("STALE_AFTER_SECS"));

ok(gatewaySource.includes("mod line_health"));
ok(gatewaySource.includes("/api/line-health"));
ok(gatewaySource.includes("LineHealthRegistry::new()"));
ok(/state\s*\.\s*line_health\s*\.\s*record/.test(gatewaySource));
ok(gatewaySource.includes("Instant::now"));

// ---- 前端契约 ----
ok(lineHealthSource.includes("/api/line-health"));
ok(lineHealthSource.includes("LINE_HEALTH_REQUEST_TIMEOUT_MS = 8000"));
ok(useLineHealthSource.includes("POLL_INTERVAL_MS = 60_000"));
ok(barSource.includes("LineHealthBar"));
ok(barSource.includes("data-tone"));
ok(lineCardSource.includes("<LineHealthBar />"));
ok(cssSource.includes(".line-health-bar"));
ok(cssSource.includes('.line-health-chip[data-tone="green"]'));
ok(cssSource.includes('.line-health-chip[data-tone="yellow"]'));
ok(cssSource.includes('.line-health-chip[data-tone="red"]'));

// ---- 格式化函数单测 ----
const transpiled = ts.transpileModule(lineHealthSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
// 替换两个外部依赖，让 transpile 后的代码能在 node 里独立加载
const stubbed = transpiled
  .replace(/from\s+["']\.\/tauri["']/g, 'from "data:text/javascript,export const getBackendGatewayUrl=()=>\\"\\""')
  .replace(/from\s+["']\.\/supabase["']/g, 'from "data:text/javascript,export const supabase={auth:{getSession:async()=>({data:{session:null}})}}"')
  .replace(/from\s+["']\.\.\/types["']/g, 'from "data:text/javascript,"');

const mod = await import(
  `data:text/javascript;base64,${Buffer.from(stubbed).toString("base64")}`
);

// formatLatency
equal(mod.formatLatency(null), "—");
equal(mod.formatLatency(800), "800ms");
equal(mod.formatLatency(2400), "2.4s");
equal(mod.formatLatency(123_000), "123s");

// formatLastSeen
const baseNow = new Date("2026-05-15T12:00:00Z");
equal(mod.formatLastSeen(null, baseNow), "暂无样本");
equal(mod.formatLastSeen("2026-05-15T11:59:30Z", baseNow), "30 秒前");
equal(mod.formatLastSeen("2026-05-15T11:55:00Z", baseNow), "5 分钟前");
equal(mod.formatLastSeen("2026-05-15T09:00:00Z", baseNow), "3 小时前");

// emptyLineHealthMap 5 条线路全 unknown
const empty = mod.emptyLineHealthMap();
equal(Object.keys(empty).length, 5);
for (const line of ["line1", "line2", "line3", "line4", "line5"]) {
  equal(empty[line].status, "unknown");
  equal(empty[line].latency_ms, null);
  equal(empty[line].sample_count, 0);
}
