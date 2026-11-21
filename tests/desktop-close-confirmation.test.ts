import { deepEqual, match, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
match(app, /<CloseConfirmation\s*\/>/, "桌面关闭确认应在应用入口挂载");

const confirmation = read("src/components/CloseConfirmation.tsx");
match(confirmation, /onCloseRequested\(\(event\) => \{\s*event\.preventDefault\(\)/,
  "原生关闭请求应先被拦截，再呈现弹窗");
match(confirmation, /showModal\(\);\s*continueButton\.current\?\.focus\(\)/,
  "对话框默认聚焦继续使用，避免误按回车退出");
match(confirmation, /async function confirmClose\(\)[\s\S]*?await getCurrentWindow\(\)\.destroy\(\)/,
  "确认后直接结束窗口，避免重新触发关闭确认");
match(confirmation, /onClick=\{confirmClose\}/, "必须由确认按钮调用关闭操作");

const capability = JSON.parse(read("src-tauri/capabilities/default.json"));
deepEqual(capability.windows, ["main"], "关闭权限仅授予主窗口");
ok(capability.permissions.includes("core:window:allow-destroy"), "允许主窗口执行确认关闭");

console.log("桌面关闭确认入口和权限验证通过");
