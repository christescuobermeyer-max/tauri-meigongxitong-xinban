import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/WorkspaceShell.tsx", import.meta.url), "utf8");
const topBarSource = readFileSync(new URL("../src/components/TopBar.tsx", import.meta.url), "utf8");
const topBarStatusSource = readFileSync(new URL("../src/components/TopBarStatus.tsx", import.meta.url), "utf8");
const updateGateSource = readFileSync(new URL("../src/components/MandatoryUpdateGate.tsx", import.meta.url), "utf8");

// 回归：顶部刷新入口允许清空工作区，但必须拦截生成中状态并提示用户先下载图片。
equal(appSource.includes("refreshKey"), false, "App 不应通过 key 重建 WorkspaceShell，这会清空正在生图和已生成结果");
equal(shellSource.includes("workspace.busy"), true, "WorkspaceShell 应感知当前是否正在生图");
equal(shellSource.includes("onRefresh: () => void"), false, "WorkspaceShell 不应再保留旧的 TopBar 刷新接口");
equal(shellSource.includes("workspaceResetKey"), true, "WorkspaceShell 应在本地管理工作区重置 key");
equal(shellSource.includes("window.confirm"), true, "刷新工作区前必须二次确认");
equal(shellSource.includes("刷新前请先下载所有需要保留的图片"), true, "确认文案应提示先下载图片");
equal(topBarSource.includes("IconRefresh"), false, "TopBar 不应再导入刷新图标");
equal(topBarSource.includes("刷新"), false, "TopBar 不应再渲染刷新按钮文案");
equal(topBarSource.includes("refreshDisabled"), false, "TopBar 不应再保留刷新禁用状态");
equal(topBarStatusSource.includes("谨慎刷新"), true, "TopBarStatus 应显示谨慎刷新按钮");
equal(topBarStatusSource.includes("disabled={busy}"), true, "生成中应禁用谨慎刷新按钮");
equal(topBarStatusSource.includes("onRefreshAll"), true, "TopBarStatus 应通过回调触发刷新");

// 回归：强制更新检查不能在无人值守生图过程中覆盖界面并诱导重启安装。
equal(appSource.includes("<MandatoryUpdateGate suspend={workspaceBusy} />"), true, "App 应在 workspace 忙碌时暂停展示强制更新弹窗");
equal(updateGateSource.includes("suspend?: boolean"), true, "MandatoryUpdateGate 应支持 suspend 参数");
equal(updateGateSource.includes("if (suspend) return"), true, "忙碌时 MandatoryUpdateGate 应跳过更新检查/展示");

console.log("workspace reset guard contract: OK");
