import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSourceTree } from "../helpers/source-tree.mjs";

const entry = new URL("../../src/lib/tauri.ts", import.meta.url);
const facade = readFileSync(entry, "utf8");
ok(facade.split(/\r?\n/).filter((line) => line.trim()).length < 40, "桌面传输入口应按职责组合");
const source = readSourceTree(entry);
for (const command of ["generateArchivedImageWithLine", "uploadImageToOss", "pickSavePath", "installAppUpdate", "parseDouyinVideo"]) {
  ok(source.includes(`function ${command}`), `保留传输 API ${command}`);
}
ok(source.includes("installer_sha256: req.installerSha256"), "安装请求必须传递完整性摘要");
console.log("桌面传输职责与更新摘要验证通过");
