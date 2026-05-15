import { ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const cargoToml = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../src-tauri/src/api.rs", import.meta.url), "utf8");
const httpClientSource = readFileSync(new URL("../src-tauri/src/http_client.rs", import.meta.url), "utf8");
const pockgoSource = readFileSync(new URL("../src-tauri/src/pockgo_chat.rs", import.meta.url), "utf8");
const pockgoTransportUrl = new URL("../src-tauri/src/pockgo_transport.rs", import.meta.url);
const pockgoTransportSource = existsSync(pockgoTransportUrl)
  ? readFileSync(pockgoTransportUrl, "utf8")
  : "";

ok(
  cargoToml.includes('"system-proxy"'),
  "线路4 pockgo 需要启用 reqwest system-proxy，兼容 Windows 系统代理"
);
ok(
  cargoToml.includes('"rustls-tls-native-roots"'),
  "线路4辅助下载仍需使用系统证书根，避免本机证书链导致 TLS 失败"
);
ok(
  apiSource.includes("format_reqwest_error"),
  "非 pockgo 请求失败时应输出 reqwest 底层错误链，不能只显示 error sending request"
);
ok(
  pockgoTransportSource.includes("user-agent") && pockgoTransportSource.includes("Accept: */*"),
  "线路4请求应补齐 User-Agent 和 Accept，避免上游网关按异常客户端处理"
);
ok(
  pockgoSource.includes("send_pockgo_chat_request"),
  "线路4 pockgo POST 应走独立兼容传输，避免 reqwest POST 在 newapi.aicohere.org 上超时"
);
ok(
  pockgoTransportSource.includes("curl.exe") && pockgoTransportSource.includes("__CSGH_HTTP_STATUS__"),
  "pockgo 兼容传输应使用系统 curl 并显式回传 HTTP 状态码"
);
ok(
  pockgoTransportSource.includes("max-time = 350") &&
    pockgoTransportSource.includes("timeout(Duration::from_secs(350))"),
  "线路4单次生成最长超时应为 350 秒"
);
ok(
  httpClientSource.includes("const API_TIMEOUT_SECS: u64 = 350;"),
  "通用生图 HTTP 客户端单次最长超时应为 350 秒"
);
