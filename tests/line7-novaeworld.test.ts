import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const imageProviderSource = readFileSync(
  new URL("../src-tauri/src/image_provider.rs", import.meta.url),
  "utf8",
);
const frontendBalanceSource = readFileSync(
  new URL("../src/lib/balance.ts", import.meta.url),
  "utf8",
);
const backendBalanceSource = readFileSync(
  new URL("../src-tauri/src/balance.rs", import.meta.url),
  "utf8",
);
const apiKeyBillingSource = readFileSync(
  new URL("../src-tauri/src/api_key_billing.rs", import.meta.url),
  "utf8",
);
const backendGatewaySource = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(new URL("../src-tauri/src/api.rs", import.meta.url), "utf8");
const editSource = readFileSync(
  new URL("../src-tauri/src/novaeworld_edit.rs", import.meta.url),
  "utf8",
);
const libSource = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

ok(
  imageProviderSource.includes("https://api.novaeworld.top/v1/images/generations"),
  "线路7生图应使用 novaeworld OpenAI-compatible generations endpoint",
);
ok(
  imageProviderSource.includes("https://api.novaeworld.top/v1/images/edits"),
  "线路7带参考图时应使用 novaeworld OpenAI-compatible edits endpoint",
);
ok(
  imageProviderSource.includes("NOVA_IMAGE_2_API_KEY"),
  "线路7生图应读取 novaeworld API key 环境变量",
);
ok(
  imageProviderSource.includes('const LINE7_MODEL: &str = "gpt-image-2";'),
  "线路7模型应使用 novaeworld 文档支持的 gpt-image-2",
);
ok(
  apiSource.includes("generate_novaeworld_edit_image") &&
    apiSource.includes("req.api_line == ImageApiLine::Line7") &&
    apiSource.includes("!req.product_images.is_empty()"),
  "线路7存在参考图时应走 novaeworld multipart 图片编辑分支，避免 generations 接口忽略参考图",
);
ok(
  editSource.includes("multipart") && editSource.includes('form.part("image", part)'),
  "novaeworld 图生图模块应使用 multipart/form-data 重复 image 字段上传参考图",
);
ok(
  editSource.includes('.text("response_format", "b64_json".to_string())'),
  "线路7编辑接口应请求 b64_json，避免上游返回内网图片 URL 后网关下载失败",
);
ok(
  !editSource.includes('.text("response_format", "url".to_string())'),
  "线路7编辑接口不应请求 url response_format",
);
ok(libSource.includes("mod novaeworld_edit;"), "Tauri 入口应注册 novaeworld_edit 模块");
ok(
  backendGatewaySource.includes('mod novaeworld_edit;'),
  "云端 backend-gateway 应注册 novaeworld_edit 模块",
);
ok(frontendBalanceSource.includes("线路7（novaeworld）"), "前端余额入口应显示 novaeworld");
ok(frontendBalanceSource.includes("https://api.novaeworld.top"), "前端余额入口应指向 novaeworld");
ok(
  frontendBalanceSource.includes("https://api.novaeworld.top/console"),
  "前端线路7后台入口应直接打开 novaeworld /console，避免停留在首页",
);
ok(
  frontendBalanceSource.includes('{ id: "line7", name: "线路7（novaeworld）", consoleUrl: "https://api.novaeworld.top/console", balanceMode: "api_key", supported: true }'),
  "线路7余额监控应和线路2/6一样使用 API Key billing 模式，不再依赖网页登录 session",
);
ok(!frontendBalanceSource.includes("otuapi"), "前端余额入口不应残留 otuapi");
ok(
  backendBalanceSource.includes('login_url: "https://api.novaeworld.top/console"'),
  "后端线路7登录页应使用 novaeworld /console，使未登录时跳转到真实登录页",
);
ok(backendBalanceSource.includes('domain: "api.novaeworld.top"'), "后端余额配置应使用 novaeworld 域名");
ok(
  backendBalanceSource.includes('api_url: "https://api.novaeworld.top/api/user/self"'),
  "后端余额配置应使用 novaeworld 用户接口",
);
ok(
  backendBalanceSource.includes('referer: "https://api.novaeworld.top/console"'),
  "后端线路7余额请求 Referer 应使用 novaeworld /console",
);
ok(
  apiKeyBillingSource.includes('const NOVAEWORLD_API_KEY_ENV_KEYS: [&str; 2]') &&
    apiKeyBillingSource.includes('"NOVA_IMAGE_2_API_KEY"') &&
    apiKeyBillingSource.includes('"IMAGE_2_LINE7_API_KEY"'),
  "后端线路7余额应复用 novaeworld 生图 API Key",
);
ok(
  apiKeyBillingSource.includes('"line7" => Ok(ApiKeyBillingConfig') &&
    apiKeyBillingSource.includes('"https://api.novaeworld.top/v1/dashboard/billing/subscription"') &&
    apiKeyBillingSource.includes('"https://api.novaeworld.top/v1/dashboard/billing/usage"'),
  "后端线路7余额应读取 novaeworld subscription 与 usage billing 接口",
);
ok(
  apiKeyBillingSource.includes('matches!(line, "line2" | "line6" | "line7")'),
  "API Key billing 支持列表应包含 line7",
);
ok(!backendBalanceSource.includes("otuapi"), "后端余额配置不应残留 otuapi");

console.log("line7 novaeworld contract: OK");
