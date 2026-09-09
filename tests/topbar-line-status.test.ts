import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const shellSource = readFileSync(
  new URL("../src/components/WorkspaceShell.tsx", import.meta.url),
  "utf8"
);
const statusSource = readFileSync(
  new URL("../src/components/TopBarStatus.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

equal(shellSource.includes("TopBarStatus"), true);
equal(shellSource.includes("generationLine={workspace.generationLine}"), false);
equal(shellSource.includes("totalCount={workspace.totalCount}"), true);
equal(shellSource.includes("globalTotalCount={workspace.globalTotalCount}"), true);
equal(shellSource.includes("onResetWorkspace={() => setWorkspaceResetKey"), true);
equal(shellSource.includes("useGenerationWorkspace"), true);
equal(shellSource.includes("window.confirm"), true);
equal(shellSource.includes("刷新会清空所有工具板块中已填写的输入框"), true);
equal(statusSource.includes("自动分配线路"), false);
equal(statusSource.includes("当前是"), false);
equal(statusSource.includes("所有账号累计"), true);
equal(statusSource.includes("当前账号累计"), true);
equal(statusSource.includes("今日已生图"), true);
equal(statusSource.includes("谨慎刷新"), true);
equal(statusSource.includes("谨慎使用：刷新前请先下载所有图片"), true);
equal(statusSource.includes("onRefreshAll"), true);
equal(statusSource.includes("disabled={busy}"), true);
ok(statusSource.indexOf("所有账号累计") < statusSource.indexOf("当前账号累计"));
ok(statusSource.indexOf("当前账号累计") < statusSource.indexOf("今日已生图"));
ok(statusSource.indexOf("今日已生图") < statusSource.indexOf("谨慎刷新"));
ok(
  statusSource.includes('data-tone="warn" title="当前账号累计成功归档到 OSS 的图片数"'),
  "当前账号累计应使用黄色 warn 主题"
);
equal(statusSource.includes("LINE_LABEL"), false);
equal(statusSource.includes("data-line={generationLine}"), false);
equal(statusSource.includes("云端网关会按线路状态和并发自动分配"), false);
equal(styles.includes('.topbar__right .badge[data-tone="warn"]:not(.topbar-line-badge)'), true);
