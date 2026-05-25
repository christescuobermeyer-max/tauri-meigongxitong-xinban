import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const gatewaySource = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);
const tauriSource = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const workspaceGenerationSource = readFileSync(
  new URL("../src/lib/workspace-generation.ts", import.meta.url),
  "utf8",
);

ok(
  gatewaySource.includes("ArchiveGeneratedImageRequest"),
  "网关生成接口应接收可选归档请求",
);
ok(
  gatewaySource.includes("archive: Option<ArchiveGeneratedImageRequest>"),
  "网关请求体应允许前端声明生成结果需要服务端归档",
);
ok(
  gatewaySource.includes("archive_url"),
  "网关生成响应应返回服务端 OSS 归档 URL",
);
ok(
  gatewaySource.includes("GATEWAY_OSS_ARCHIVE_LIMIT"),
  "网关应有独立的 OSS 归档并发上限",
);
ok(
  /"GATEWAY_OSS_ARCHIVE_LIMIT",\s+6,/.test(gatewaySource),
  "网关 OSS 归档并发默认值应为 6",
);
ok(
  gatewaySource.includes("compress_generated_image"),
  "网关应在服务端压缩生成图后再上传 OSS",
);
ok(
  gatewaySource.includes("upload_image_to_oss"),
  "网关应由服务器端执行生成图 OSS 上传",
);

ok(
  tauriSource.includes("ArchiveGeneratedImageRequest"),
  "前端网关请求类型应包含归档参数",
);
ok(
  tauriSource.includes("generateArchivedImageWithLine"),
  "前端应提供生成并由网关归档的调用函数",
);
ok(
  tauriSource.includes("archive_url"),
  "前端应读取网关返回的 archive_url",
);

ok(
  workspaceGenerationSource.includes("generateArchivedImageWithLine"),
  "通用生图流程在网关模式下应走网关端归档",
);
ok(
  workspaceGenerationSource.includes("archiveError"),
  "归档失败应与生图失败解耦，保留生成结果并提示归档错误",
);

console.log("gateway archive generation contract: OK");
