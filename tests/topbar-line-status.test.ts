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
equal(shellSource.includes("generationLine={workspace.generationLine}"), true);
equal(statusSource.includes("当前是"), true);
equal(statusSource.includes("今日已生图"), true);
ok(statusSource.indexOf("当前是") < statusSource.indexOf("今日已生图"));
equal(statusSource.includes("LINE_LABEL"), true);
equal(statusSource.includes("line1: \"线路1\""), true);
equal(statusSource.includes("line2: \"线路2\""), true);
equal(statusSource.includes("line3: \"线路3\""), true);
equal(statusSource.includes("line4: \"线路4\""), true);
equal(statusSource.includes("line5: \"线路5\""), true);
equal(statusSource.includes('line5: "gold"'), true);
equal(statusSource.includes("data-line={generationLine}"), true);
equal(statusSource.includes('title="当前选择的生图线路"'), true);
equal(styles.includes(".topbar-line-badge"), true);
equal(styles.includes('.topbar-line-badge[data-line="line5"]'), true);
equal(styles.includes("--line5-gold"), true);
