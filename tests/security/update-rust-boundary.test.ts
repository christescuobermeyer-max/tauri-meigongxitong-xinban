import { equal, match } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../src-tauri/src/app_update.rs", import.meta.url), "utf8");
match(source, /installer_sha256:\s*String/, "安装命令必须接收摘要并在 Rust 边界校验");
const download = readFileSync(new URL("../../src-tauri/src/app_update/download.rs", import.meta.url), "utf8");
match(download, /https_only\(true\)/, "下载及自动重定向必须拒绝 HTTP");
match(download, /write_verified_stream/);
match(download, /remove_file/);
match(download, /rename/);
const gate = readFileSync(new URL("../../src/components/MandatoryUpdateGate.tsx", import.meta.url), "utf8");
equal(gate.includes("update.installBlockedReason || !update.installerSha256"), true);
equal(gate.includes("稍后更新"), true);
console.log("Rust 更新安装边界契约验证通过");
