import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const providerSource = readFileSync(new URL("../src-tauri/src/image_provider.rs", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../src-tauri/src/api.rs", import.meta.url), "utf8");
const httpClientSource = readFileSync(new URL("../src-tauri/src/http_client.rs", import.meta.url), "utf8");
const pockgoSourcePath = new URL("../src-tauri/src/pockgo_chat.rs", import.meta.url);
const formatSource = readFileSync(new URL("../src-tauri/src/pockgo_chat_format.rs", import.meta.url), "utf8");

ok(
  providerSource.includes('const LINE2_API_URL: &str = "https://newapi.aicohere.org/v1/chat/completions"'),
  "线路2应按新域名调用 chat/completions"
);
ok(
  providerSource.includes('const LINE2_MODEL: &str = "gpt-image-2"'),
  "线路2应使用 pockgo 的 gpt-image-2 图片模型"
);
ok(
  apiSource.includes("generate_pockgo_chat_image"),
  "线路2应走独立的 pockgo chat 生图调用"
);

const pockgoSource = readFileSync(pockgoSourcePath, "utf8");

ok(
  pockgoSource.includes("ChatPart::ImageUrl") && pockgoSource.includes("ChatContent::Parts"),
  "pockgo 图生图应使用 messages.content.image_url"
);
ok(pockgoSource.includes("extra_body"), "pockgo 生图应支持 extra_body.imageConfig 比例控制");
ok(pockgoSource.includes("max_tokens"), "pockgo chat/completions 请求应包含 max_tokens");
ok(pockgoSource.includes("temperature"), "pockgo chat/completions 请求应包含 temperature");
ok(
  pockgoSource.includes("build_system_prompt") &&
    formatSource.includes("imageConfig") &&
    formatSource.includes("aspectRatio"),
  "pockgo 比例控制应把 imageConfig JSON 写入 system content"
);
ok(httpClientSource.includes("http1_only"), "线路2客户端应强制使用 HTTP/1.1，避免代理或服务端提前断流");
ok(pockgoSource.includes("Version::HTTP_11"), "线路2请求应显式指定 HTTP/1.1");
ok(pockgoSource.includes("CONNECTION"), "线路2请求应显式发送 Connection: close");
ok(pockgoSource.includes("ACCEPT_ENCODING"), "线路2请求应显式关闭压缩响应");
ok(
  !pockgoSource.includes("to_data_url_if_needed"),
  "线路2应直接发送参考图 OSS URL，不应先下载并转为 data URL"
);
ok(
  readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8").includes("mod reference_image;"),
  "Tauri 入口应注册参考图标准化模块"
);
ok(formatSource.includes("build_system_prompt"), "pockgo 格式化辅助模块应保留 system prompt 组装");
ok(formatSource.includes("extract_image_from_content"), "pockgo 格式化辅助模块应保留响应图片提取逻辑");
