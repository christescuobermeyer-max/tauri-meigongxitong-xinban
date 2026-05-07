import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const providerSource = readFileSync(
  new URL("../src-tauri/src/image_provider.rs", import.meta.url),
  "utf8"
);
const apiSource = readFileSync(new URL("../src-tauri/src/api.rs", import.meta.url), "utf8");
const payloadSource = readFileSync(
  new URL("../src-tauri/src/image_generation_payload.rs", import.meta.url),
  "utf8"
);
const responseSource = readFileSync(
  new URL("../src-tauri/src/image_api_response.rs", import.meta.url),
  "utf8"
);
const libSource = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

ok(
  providerSource.includes('const LINE2_API_URL: &str = "https://yunwu.ai/v1/images/generations"'),
  "线路2应使用 Apifox 文档中的 yunwu.ai 创建图片接口"
);
ok(
  providerSource.includes('const LINE2_EDIT_API_URL: &str = "https://yunwu.ai/v1/images/edits"'),
  "线路2带参考图时应使用 Apifox 文档中的 yunwu.ai 图片编辑接口"
);
ok(providerSource.includes('quality: Some("low")'), "线路2请求体应带 quality=low");
ok(providerSource.includes('format: Some("png")'), "线路2请求体应带 format=png，保持现有图片链路 MIME 一致");
ok(payloadSource.includes("quality: provider.quality"), "image-2 请求体应透传 provider quality");
ok(payloadSource.includes("format: provider.format"), "image-2 请求体应透传 provider format");
ok(
  apiSource.includes("generate_yunwu_edit_image") &&
    apiSource.includes("req.api_line == ImageApiLine::Line2") &&
    apiSource.includes("!req.product_images.is_empty()"),
  "线路2存在参考图时应走 multipart 图片编辑分支，避免 generations 接口收到不支持的 image 参数"
);
ok(
  responseSource.includes("extract_image_from_response_body") &&
    responseSource.includes('get("data")') &&
    responseSource.includes('get("choices")') &&
    responseSource.includes("data:image/") &&
    responseSource.includes("extract_markdown_image_target"),
  "线路2响应解析应同时兼容 data[] 和 Apifox 示例的 chat.completion content"
);
ok(libSource.includes("mod image_api_response;"), "Tauri 入口应注册 image_api_response 模块");
