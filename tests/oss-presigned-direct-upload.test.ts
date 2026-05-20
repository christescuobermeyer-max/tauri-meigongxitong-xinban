import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// ---- 后端契约 ----
const ossSrc = readFileSync(
  new URL("../src-tauri/src/oss.rs", import.meta.url),
  "utf8",
);
ok(
  ossSrc.includes("PUT_URL_EXPIRE_SECONDS: i64 = 600"),
  "PUT URL 有效期应为 600 秒（10 分钟）",
);
ok(
  ossSrc.includes("DOWNLOAD_URL_EXPIRE_SECONDS: i64 = 60 * 60 * 24 * 7"),
  "GET URL 仍保持 7 天，不随本次改动收紧",
);
ok(
  ossSrc.includes("pub async fn presign_oss_urls"),
  "应导出 presign_oss_urls 函数",
);
ok(ossSrc.includes("sign_upload_url"), "应调用 SDK 的 sign_upload_url");
ok(ossSrc.includes("sign_download_url"), "应同时签 download URL 返回给前端");
ok(
  ossSrc.includes("PresignOssUrlsRequest"),
  "应有请求结构体",
);
ok(
  ossSrc.includes("PresignOssUrlsResponse"),
  "应有响应结构体",
);
ok(
  /content_type:\s*String/.test(ossSrc) &&
    /pub put_url:\s*String/.test(ossSrc) &&
    /pub get_url:\s*String/.test(ossSrc),
  "响应应包含 put_url / get_url / content_type 三个字段",
);

const gatewaySrc = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);
ok(
  gatewaySrc.includes('"/api/oss-presigned-urls"'),
  "网关应注册 /api/oss-presigned-urls 路由",
);
ok(
  /async fn oss_presigned_urls[\s\S]*?verify_access_token/.test(gatewaySrc),
  "/api/oss-presigned-urls 必须先做鉴权",
);

// ---- 前端契约 ----
const tauriSrc = readFileSync(
  new URL("../src/lib/tauri.ts", import.meta.url),
  "utf8",
);
ok(
  tauriSrc.includes("PresignOssUrlsRequest"),
  "tauri.ts 应导出 PresignOssUrlsRequest 类型",
);
ok(
  tauriSrc.includes("PresignOssUrlsResponse"),
  "tauri.ts 应导出 PresignOssUrlsResponse 类型",
);
ok(
  tauriSrc.includes("requestOssPresignedUrls"),
  "tauri.ts 应导出 requestOssPresignedUrls 函数",
);
ok(
  /requestOssPresignedUrls[\s\S]*?\/api\/oss-presigned-urls/.test(tauriSrc),
  "requestOssPresignedUrls 必须调用 /api/oss-presigned-urls",
);

const ossAssetsSrc = readFileSync(
  new URL("../src/lib/oss-assets.ts", import.meta.url),
  "utf8",
);
ok(
  ossAssetsSrc.includes("requestOssPresignedUrls"),
  "oss-assets 应引入 requestOssPresignedUrls",
);
ok(
  ossAssetsSrc.includes("directPutWithRetry"),
  "应有 directPutWithRetry 包装函数",
);
ok(
  ossAssetsSrc.includes("ARCHIVE_MAX_ATTEMPTS = 3"),
  "归档应保留 3 次重试",
);
ok(
  /if\s*\(\s*getBackendGatewayUrl\(\)\s*\)\s*\{\s*return\s+await\s+directPutWithRetry/.test(
    ossAssetsSrc,
  ),
  "配置网关时优先走 directPutWithRetry，否则回落到 uploadImageToOss",
);
ok(
  ossAssetsSrc.includes("uploadImageToOss"),
  "保留 uploadImageToOss 作为本地 Tauri fallback",
);
ok(
  /method:\s*"PUT"[\s\S]*?Content-Type/.test(ossAssetsSrc),
  "直传必须用 PUT + 正确 Content-Type",
);
ok(
  ossAssetsSrc.includes("AbortController"),
  "直传必须配 AbortController 超时",
);
ok(
  ossAssetsSrc.includes("DIRECT_PUT_TIMEOUT_MS"),
  "直传单次应设置专属超时",
);

// ---- 运行时：网关模式走直传 + 重试 ----
const presignCalls: unknown[] = [];
const putCalls: { url: string; contentType: string; size: number }[] = [];
let putAttemptResults: Array<{ ok: boolean; status?: number; body?: string }> = [];

const stubbedSrc = ossAssetsSrc
  .replace(
    /import \{[^}]*\} from "\.\/tauri";/,
    `function getBackendGatewayUrl() { return "https://gw.example"; }
async function requestOssPresignedUrls(req) {
  globalThis.__presignCalls.push(req);
  return {
    key: "generated/" + req.file_name,
    put_url: "https://oss.example.com/put/" + req.file_name,
    get_url: "https://oss.example.com/get/" + req.file_name,
    content_type: req.mime_type,
    put_expires_in_seconds: 600,
  };
}
async function uploadImageToOss() { throw new Error("should not be reached when gateway configured"); }`,
  )
  .replace(
    'import { compressGeneratedImage } from "./tauri-image";',
    `async function compressGeneratedImage(req) {
  return { base64_data: "QUJD", mime_type: "image/jpeg", byte_size: 3, width: 1, height: 1 };
}`,
  )
  .replace('import { safeFileName } from "./utils";', 'function safeFileName(s) { return s; }')
  .replace(/import type \{[\s\S]*?\} from "\.\.\/types";/, "");

const transpiled = ts.transpileModule(stubbedSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;

(globalThis as unknown as { __presignCalls: unknown[] }).__presignCalls = presignCalls;
(globalThis as unknown as { window: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } }).window =
  { setTimeout, clearTimeout };

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  putCalls.push({
    url,
    contentType: (init?.headers as Record<string, string> | undefined)?.["Content-Type"] ?? "",
    size: (init?.body as Uint8Array | undefined)?.length ?? 0,
  });
  const result = putAttemptResults.shift() ?? { ok: true };
  return new Response(result.body ?? "", {
    status: result.status ?? (result.ok ? 200 : 500),
  });
}) as typeof fetch;

const mod = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);

// 一次成功
putAttemptResults = [{ ok: true }];
let url = await mod.compressAndArchiveGenerated("avatar", "rawbase", "shop-1-avatar");
equal(url, "https://oss.example.com/get/shop-1-avatar.jpg", "成功时应返回 get_url");
equal(presignCalls.length, 1, "成功只签一次 URL");
equal(putCalls.length, 1, "成功只 PUT 一次");
equal(putCalls[0].url, "https://oss.example.com/put/shop-1-avatar.jpg");
equal(putCalls[0].contentType, "image/jpeg", "PUT 必须带签名时声明的 Content-Type");
equal(putCalls[0].size, 3, "PUT body 应是 base64 解码后的二进制，QUJD -> ABC 3 字节");

// 前两次失败，第 3 次成功
presignCalls.length = 0;
putCalls.length = 0;
putAttemptResults = [
  { ok: false, status: 503, body: "Service Unavailable" },
  { ok: false, status: 503, body: "Service Unavailable" },
  { ok: true },
];
url = await mod.compressAndArchiveGenerated("avatar", "rawbase", "shop-2-avatar");
equal(url, "https://oss.example.com/get/shop-2-avatar.jpg", "重试后成功仍返回 get_url");
equal(presignCalls.length, 3, "每次重试都重新签 URL（避免 URL 过期）");
equal(putCalls.length, 3, "应实际 PUT 3 次");

// 连续 3 次失败应抛错
presignCalls.length = 0;
putCalls.length = 0;
putAttemptResults = [
  { ok: false, status: 503 },
  { ok: false, status: 503 },
  { ok: false, status: 503 },
];
let threw = false;
try {
  await mod.compressAndArchiveGenerated("avatar", "rawbase", "shop-3-avatar");
} catch (e) {
  threw = true;
  ok(String(e).includes("503"), "错误信息应携带 OSS 返回的状态码");
}
ok(threw, "3 次全失败必须抛出错误");
equal(putCalls.length, 3, "失败也应该尝试满 3 次");

globalThis.fetch = originalFetch;

console.log("oss presigned direct upload contract: OK");
