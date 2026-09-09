import { equal, match, ok, rejects } from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  downloadOssImageAsBase64,
  type OssImageFetch,
} from "../src/lib/oss-image-download.ts";

const gatewaySource = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);
const tauriSource = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");

ok(
  gatewaySource.includes("result_delivery: ResultDelivery"),
  "网关请求应包含可选的结果交付模式",
);
ok(
  gatewaySource.includes("image: Option<String>"),
  "URL 模式下网关应允许 image 为 null",
);
ok(gatewaySource.includes("image_url"), "网关响应应包含显式 image_url");
ok(
  tauriSource.includes('result_delivery: "oss_url"'),
  "新版客户端的归档生图请求应显式协商 OSS URL",
);
ok(
  tauriSource.includes("downloadOssImageAsBase64"),
  "客户端应在统一入口直接下载 OSS 图片",
);

const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03]);
let attempts = 0;
const retryingFetch: OssImageFetch = async () => {
  attempts += 1;
  if (attempts === 1) throw new TypeError("temporary network failure");
  if (attempts === 2) return new Response("busy", { status: 503 });
  return new Response(jpegBytes, {
    status: 200,
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpegBytes.byteLength) },
  });
};

const downloaded = await downloadOssImageAsBase64(
  "https://oss.example.com/generated/result.jpg?Signature=secret",
  {
    fetchImpl: retryingFetch,
    maxAttempts: 3,
    retryBaseDelayMs: 0,
    timeoutMs: 1_000,
  },
);

equal(attempts, 3, "临时网络错误和 503 后应继续重试");
equal(downloaded.base64, Buffer.from(jpegBytes).toString("base64"));
equal(downloaded.mimeType, "image/jpeg");
equal(downloaded.dataUrl, `data:image/jpeg;base64,${downloaded.base64}`);

await rejects(
  () =>
    downloadOssImageAsBase64("https://oss.example.com/generated/error.jpg?Signature=do-not-log", {
      fetchImpl: async () => new Response("<Error>denied</Error>", { status: 403 }),
      maxAttempts: 1,
      retryBaseDelayMs: 0,
      timeoutMs: 1_000,
    }),
  (error: unknown) => {
    ok(error instanceof Error);
    match(error.message, /HTTP 403/);
    equal(error.message.includes("do-not-log"), false, "错误信息不得泄露 OSS 签名参数");
    return true;
  },
);

await rejects(
  () =>
    downloadOssImageAsBase64("https://oss.example.com/generated/not-image", {
      fetchImpl: async () =>
        new Response("not an image", { status: 200, headers: { "Content-Type": "text/plain" } }),
      maxAttempts: 1,
      retryBaseDelayMs: 0,
      timeoutMs: 1_000,
    }),
  /不是图片/,
);

console.log("OSS result delivery contract: OK");
