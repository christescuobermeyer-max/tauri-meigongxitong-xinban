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
const frontendBalanceSource = readFileSync(
  new URL("../src/lib/balance.ts", import.meta.url),
  "utf8"
);
const backendBalanceSource = readFileSync(
  new URL("../src-tauri/src/balance.rs", import.meta.url),
  "utf8"
);
const apiKeyBillingSource = readFileSync(
  new URL("../src-tauri/src/api_key_billing.rs", import.meta.url),
  "utf8"
);
const backendGatewaySource = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8"
);
const adminBalancePanelSource = readFileSync(
  new URL("../src/components/admin/AdminBalancePanel.tsx", import.meta.url),
  "utf8"
);

ok(
  providerSource.includes(
    'const LINE2_API_URL: &str = "https://img.zikl.dev/v1/images/generations"'
  ),
  "线路2应使用 Zikl 创建图片接口"
);
ok(
  providerSource.includes(
    'const LINE2_EDIT_API_URL: &str = "https://img.zikl.dev/v1/images/edits"'
  ),
  "线路2带参考图时应使用 Zikl 图片编辑接口"
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
ok(frontendBalanceSource.includes("线路2（Zikl）"), "前端余额入口应显示 Zikl");
ok(
  frontendBalanceSource.includes('consoleUrl: "https://img.zikl.dev/console"'),
  "前端线路2后台入口应打开 Zikl console"
);
ok(
  frontendBalanceSource.includes('balanceMode: "api_key"'),
  "线路2余额应使用 API Key 模式，不依赖旧站 Cookie"
);
ok(
  backendBalanceSource.includes('login_url: "https://img.zikl.dev/console"'),
  "后端线路2登录页应使用 Zikl console"
);
ok(
  backendBalanceSource.includes('domain: "img.zikl.dev"'),
  "后端线路2 Cookie 域应使用 Zikl"
);
ok(
  backendBalanceSource.includes('api_url: "https://img.zikl.dev/api/user/self"') &&
    backendBalanceSource.includes('referer: "https://img.zikl.dev/console"'),
  "后端线路2站点配置应全部切换到 Zikl"
);
ok(
  apiKeyBillingSource.includes(
    '"https://img.zikl.dev/v1/dashboard/billing/subscription"'
  ) &&
    apiKeyBillingSource.includes(
      '"https://img.zikl.dev/v1/dashboard/billing/usage"'
    ),
  "线路2余额应读取 Zikl subscription 与 usage 接口"
);
ok(
  apiKeyBillingSource.includes('"line2" => Ok(ApiKeyBillingConfig') &&
    apiKeyBillingSource.includes("total_usage / 100.0"),
  "线路2余额应按 New-API billing 语义换算已用额度"
);
ok(
  frontendBalanceSource.includes('"/api/admin/balance"') &&
    frontendBalanceSource.includes('line?.balanceMode === "api_key"'),
  "网关模式下线路2/6余额应由云端网关读取，避免员工客户端缺少 API Key"
);
ok(
  backendGatewaySource.includes('.route("/api/admin/balance", post(admin_balance_fetch))') &&
    backendGatewaySource.includes("fetch_api_key_billing_balance_for_line"),
  "后端网关应提供管理员余额查询接口并复用 API Key billing 模块"
);
ok(
  adminBalancePanelSource.includes('@tauri-apps/plugin-shell') &&
    adminBalancePanelSource.includes('line.balanceMode === "api_key"'),
  "API Key 余额线路应直接打开 Zikl 控制台，不要求 Cookie 登录"
);
