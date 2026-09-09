import { ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const gatewaySource = readFileSync(
  new URL("src-tauri/src/bin/backend_gateway.rs", root),
  "utf8",
);
const apimartSource = readFileSync(new URL("src-tauri/src/apimart.rs", root), "utf8");
const taskStoreUrl = new URL("src-tauri/src/apimart_task_store.rs", root);
const cargoSource = readFileSync(new URL("src-tauri/Cargo.toml", root), "utf8");

ok(existsSync(taskStoreUrl), "应新增 APIMart pending task 持久化模块");
const taskStoreSource = existsSync(taskStoreUrl) ? readFileSync(taskStoreUrl, "utf8") : "";

ok(
  apimartSource.includes("generate_apimart_image_with_task_hook"),
  "APIMart 提交 task_id 后应支持网关注入持久化 hook",
);
ok(
  taskStoreSource.includes("PendingApimartTask"),
  "task store 应定义可序列化的 pending APIMart task",
);
ok(
  taskStoreSource.includes("insert(") && taskStoreSource.includes("remove("),
  "task store 应支持新增和移除 pending task",
);
ok(
  gatewaySource.includes("mod apimart_task_store;"),
  "网关二进制应加载 APIMart task store 模块",
);
ok(
  gatewaySource.includes("remember_apimart_task"),
  "线路5提交成功后，网关应持久化 task_id 和归档元数据",
);
ok(
  gatewaySource.includes("start_apimart_recovery_worker"),
  "网关启动后应启动 APIMart pending task 恢复任务",
);
ok(
  gatewaySource.includes("recover_apimart_task"),
  "恢复任务应能重新轮询 APIMart task 并归档入库",
);
ok(
  cargoSource.includes('"fs"'),
  "Tokio 应启用 fs feature 以便异步持久化 pending task 文件",
);

console.log("apimart task persistence contract: OK");
