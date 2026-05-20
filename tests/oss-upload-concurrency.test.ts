import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/lib/oss-assets.ts", import.meta.url), "utf8");

ok(src.includes("UPLOAD_CONCURRENCY = 2"), "OSS 上传并发上限应压到 2");
ok(src.includes("UPLOAD_TIMEOUT_MS = 30_000"), "应保持单次 30s 超时");
ok(src.includes("UPLOAD_MAX_ATTEMPTS = 3"), "应保留 3 次重试");
ok(!src.includes("Promise.all(\n    images.map"), "不应再用 Promise.all 全部并发");
ok(src.includes("uploadOneWithRetry"), "应有 retry 包装函数");

const tauriSrc = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
ok(tauriSrc.includes("options.timeoutMs"), "callBackendGateway 应接受可选 timeoutMs");
ok(
  /uploadImageToOss[\s\S]*?options:\s*\{\s*timeoutMs/.test(tauriSrc),
  "uploadImageToOss 应支持 timeoutMs 参数"
);

equal(0, 0);
console.log("oss upload concurrency contract: OK");
