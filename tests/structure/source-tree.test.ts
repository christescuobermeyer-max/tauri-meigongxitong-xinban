import { ok, rejects } from "node:assert/strict";
import { existsSync } from "node:fs";

const helper = new URL("../helpers/source-tree.mjs", import.meta.url);
ok(existsSync(helper), "契约测试需要读取拆分后的实际职责模块");
const { readSourceTree } = await import(helper.href);
const app = readSourceTree(new URL("../../src/App.tsx", import.meta.url));
ok(app.includes("function App("));
ok(app.includes("function WorkspaceRuntime("));
ok(app.includes("WORKSPACE_CATALOG"));
const rust = readSourceTree(new URL("../../src-tauri/src/lib.rs", import.meta.url));
ok(rust.includes("fn run("));
ok(rust.includes("fn generate_image("));
await rejects(async () => readSourceTree(new URL("../../.env.local", import.meta.url)), /源码目录/);
console.log("源码模块依赖读取验证通过");
