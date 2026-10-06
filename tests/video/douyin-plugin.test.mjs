import { ok, equal } from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const plugin = new URL("scripts/video/yt_dlp_plugins/extractor/csgh_douyin.py", root);
ok(existsSync(plugin), "云端抖音解析需要包含 UIFID 和 SecSDK 签名的兼容插件");
const result = spawnSync(process.env.PYTHON || "python", [
  "-B", fileURLToPath(new URL("douyin_plugin_test.py", import.meta.url)),
], { cwd: fileURLToPath(root), encoding: "utf8", windowsHide: true, timeout: 30_000 });
equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
console.log("抖音请求签名、插件调用和失败分支验证通过");
