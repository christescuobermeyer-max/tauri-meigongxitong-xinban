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
equal(statusSource.includes("自动分配线路"), true);
equal(statusSource.includes("当前是"), false);
equal(statusSource.includes("今日已生图"), true);
ok(statusSource.indexOf("自动分配线路") < statusSource.indexOf("今日已生图"));
equal(statusSource.includes("LINE_LABEL"), false);
equal(statusSource.includes("data-line={generationLine}"), false);
equal(statusSource.includes("云端网关会按线路状态和并发自动分配"), true);
equal(styles.includes(".topbar-line-badge"), true);
