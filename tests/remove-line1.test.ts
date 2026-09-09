import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

function read(path: string) {
  return readFileSync(new URL(path, root), "utf8");
}

const provider = read("src-tauri/src/image_provider.rs");
const validation = read("src-tauri/src/api_validation.rs");
const limiter = read("src-tauri/src/gateway_limiter.rs");
const gateway = read("src-tauri/src/bin/backend_gateway.rs");
const backendHealth = read("src-tauri/src/line_health.rs");
const frontendHealth = read("src/lib/line-health.ts");
const frontendBalance = read("src/lib/balance.ts");
const pSignboard = read("src/lib/p-signboard.ts");
const backendBalance = read("src-tauri/src/balance.rs");
const adminMonitor = read("src/components/admin/AdminGatewayMonitor.tsx");
const frontendTypes = read("src/types.ts");
const deployDoc = read("docs/backend-gateway-deploy.md");
const gatewayEnvExample = read("docs/cloud-gateway/gateway.env.example");

ok(!provider.includes("Line1"), "Rust 生图 provider 不应再定义 ImageApiLine::Line1");
ok(!provider.includes("LINE1_"), "Rust 生图 provider 不应再保留线路1常量");
ok(!provider.includes("api3.wlai.vip"), "Rust 生图 provider 不应再包含线路1 API 地址");
ok(!provider.includes('serde(rename = "line1")'), "Rust 生图枚举不应再接受 line1");
ok(!validation.includes("ImageApiLine::Line1"), "Rust 请求校验不应再允许线路1");

ok(!limiter.includes('"line1"'), "自动分配限流器不应再包含 line1");
ok(
  limiter.includes('AUTO_GENERATION_LINES: [&str; 6] = ["line2", "line3", "line4", "line5", "line6", "line7"]'),
  "自动分配候选应只保留 line2-line7"
);
ok(!gateway.includes("GATEWAY_GENERATION_LINE1_LIMIT"), "网关不应再配置 line1 并发上限");
ok(!gateway.includes("ImageApiLine::Line1"), "网关不应再有 line1 手动路径");
ok(!gateway.includes('"line1" |'), "网关线路校验不应再接受 line1");
ok(!backendHealth.includes('"line1"'), "网关健康状态不应再初始化 line1");
ok(!frontendHealth.includes('"line1"'), "前端线路健康状态不应再初始化 line1");
ok(!adminMonitor.includes("fallback"), "后台网关实时监控不应再展示 line1 fallback 标记");
ok(
  frontendTypes.includes('export type GenerationLine = "line2" | "line3" | "line4" | "line5" | "line6" | "line7";'),
  "前端运行态生图线路类型应只允许 line2-line7"
);
ok(
  frontendTypes.includes('export type HistoricalGenerationLine = "line1" | GenerationLine;'),
  "旧历史记录可保留 line1 兼容标签，但不能作为运行态 GenerationLine"
);

ok(!frontendBalance.includes('"line1"'), "前端余额监控不应再展示线路1");
ok(!pSignboard.includes('?? "line1"'), "P门头默认线路不应再回退到 line1");
ok(!backendBalance.includes('"line1"'), "后端余额监控命令不应再支持线路1");
ok(!deployDoc.includes("IMAGE_2_API_KEY=线路1"), "网关部署文档不应再要求线路1 key");
ok(!/^IMAGE_2_API_KEY=/m.test(gatewayEnvExample), "网关环境变量示例不应再配置线路1 key");

equal(provider.includes('serde(rename = "line2")'), true);
equal(gateway.includes('read_limit_env("GATEWAY_GENERATION_LINE2_LIMIT", 6)'), true);

console.log("remove line1 contract: OK");
