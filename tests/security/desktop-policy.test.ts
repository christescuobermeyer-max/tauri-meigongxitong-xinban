import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const policy = config.app.security.csp;
ok(typeof policy === "string" && policy.includes("script-src 'self'"), "桌面页面只能执行应用脚本");
ok(!policy.includes("'unsafe-eval'"), "正式页面不允许动态执行任意脚本");
ok(policy.includes("asset:") && policy.includes("blob:"), "保留本地媒体预览");
ok(!config.app.security.assetProtocol.scope.some((scope: string) => /^[A-Z]:\\\*\*$/.test(scope)), "静态资源范围不能覆盖整个磁盘");
for (const [file, variable] of [["preview.rs", "preview_path"], ["download.rs", "file_path"]]) {
  const source = readFileSync(new URL(`../../src-tauri/src/video_commands/${file}`, import.meta.url), "utf8");
  ok(source.includes(`asset_protocol_scope().allow_file(&${variable})`), "生成的视频文件必须单独授权预览");
}
console.log("桌面内容与本地资源范围验证通过");
