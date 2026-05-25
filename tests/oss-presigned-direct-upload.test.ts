import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// ---- 后端兼容契约：presign 端点仍保留，供非生成图直传场景使用 ----
const ossSrc = readFileSync(
  new URL("../src-tauri/src/oss.rs", import.meta.url),
  "utf8",
);
ok(
  ossSrc.includes("PUT_URL_EXPIRE_SECONDS: i64 = 600"),
  "PUT URL 有效期应为 600 秒（10 分钟）",
);
ok(ossSrc.includes("pub async fn presign_oss_urls"), "应保留 presign_oss_urls 函数");
ok(ossSrc.includes("sign_upload_url"), "应调用 SDK 的 sign_upload_url");
ok(ossSrc.includes("sign_download_url"), "应同时签 download URL 返回给前端");

const gatewaySrc = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);
ok(gatewaySrc.includes('"/api/oss-presigned-urls"'), "网关应保留 /api/oss-presigned-urls 路由");
ok(
  /async fn oss_presigned_urls[\s\S]*?verify_access_token/.test(gatewaySrc),
  "/api/oss-presigned-urls 必须先做鉴权",
);

// ---- 新生成图契约：网关模式下 oss-assets 不再本机直传生成图 ----
const ossAssetsSrc = readFileSync(
  new URL("../src/lib/oss-assets.ts", import.meta.url),
  "utf8",
);
ok(
  !ossAssetsSrc.includes("requestOssPresignedUrls"),
  "生成图归档不应再通过前端换签名 URL 后本机直传 OSS",
);
ok(
  !ossAssetsSrc.includes("directPutWithRetry"),
  "生成图归档不应再保留前端直传重试函数",
);
ok(
  ossAssetsSrc.includes("resolveGeneratedArchiveUrl"),
  "生成图归档应优先使用网关随生图返回的 archive_url",
);

const stubbedSrc = ossAssetsSrc
  .replace(
    /import \{[^}]*\} from "\.\/tauri";/,
    `function getBackendGatewayUrl() { return "https://gw.example"; }
async function uploadImageToOss() { throw new Error("should not upload from client in gateway mode"); }`,
  )
  .replace(
    'import { compressGeneratedImage } from "./tauri-image";',
    `async function compressGeneratedImage() { throw new Error("should not compress locally in gateway mode"); }`,
  )
  .replace('import { safeFileName } from "./utils";', 'function safeFileName(s) { return s; }')
  .replace(/import type \{[\s\S]*?\} from "\.\.\/types";/, "");

const transpiled = ts.transpileModule(stubbedSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);

const archived = await mod.resolveGeneratedArchiveUrl("avatar", "raw", "shop-avatar", {
  archiveUrl: "https://oss.example.com/generated/shop-avatar.jpg",
});
equal(
  archived,
  "https://oss.example.com/generated/shop-avatar.jpg",
  "网关模式应直接使用 archive_url",
);

const missingArchive = await mod.resolveGeneratedArchiveUrl("avatar", "raw", "shop-avatar", {
  archiveError: "OSS busy",
});
equal(missingArchive, "", "网关归档失败时不应回退到本机上传");

let threw = false;
try {
  await mod.compressAndArchiveGenerated("avatar", "raw", "shop-avatar");
} catch (error) {
  threw = true;
  ok(String(error).includes("服务器端归档"), "错误应说明网关模式必须服务端归档");
}
ok(threw, "网关模式下直接调用本地生成图归档应失败");

console.log("oss generated archive gateway contract: OK");
