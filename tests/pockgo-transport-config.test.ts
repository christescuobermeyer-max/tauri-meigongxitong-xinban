import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const cargoToml = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../src-tauri/src/api.rs", import.meta.url), "utf8");

ok(
  cargoToml.includes('"system-proxy"'),
  "线路2 pockgo 需要启用 reqwest system-proxy，兼容 Windows 系统代理"
);
ok(
  cargoToml.includes('"rustls-tls-native-roots"'),
  "线路2 pockgo 需要使用系统证书根，避免本机代理证书导致 TLS 失败"
);
ok(
  apiSource.includes("format_reqwest_error"),
  "线路2请求失败时应输出 reqwest 底层错误链，不能只显示 error sending request"
);
