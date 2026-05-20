import { equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const root = new URL("../", import.meta.url);

function read(path: string) {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const typesSource = read("src/types.ts");
const cardSource = read("src/components/GenerationLineCard.tsx");
const topbarSource = read("src/components/TopBarStatus.tsx");
const supabaseSource = read("src/lib/supabase.ts");
const historySource = read("src/lib/history.ts");
const historyPanelSource = read("src/components/HistoryPanel.tsx");
const adminDetailSource = read("src/components/admin/AdminGenerationDetail.tsx");
const adminLogListSource = read("src/components/admin/AdminGenerationLogList.tsx");
const schemaSource = read("supabase/schema.sql");
const providerSource = read("src-tauri/src/image_provider.rs");
const apiSource = read("src-tauri/src/api.rs");
const apimartSource = read("src-tauri/src/apimart.rs");
const apimartCombinedSource = [
  apimartSource,
  read("src-tauri/src/apimart_reference.rs"),
  read("src-tauri/src/apimart_task.rs"),
].join("\n");
const envExample = read(".env.example");

ok(typesSource.includes('"line5"'), "前端 GenerationLine 类型应包含线路5");
ok(!cardSource.includes("GenerationLineSelect"), "生图线路卡片不应展示手动线路切换");
ok(cardSource.includes("<LineHealthBar />"), "生图线路卡片应保留线路状态");
ok(topbarSource.includes("自动分配线路"), "顶部应显示自动分配线路");

ok(supabaseSource.includes('"line5"'), "云端生图记录类型应允许线路5");
ok(historySource.includes('"line5"'), "历史记录规范化应保留线路5");
ok(historyPanelSource.includes('if (line === "line5") return "线路5";'), "历史记录应显示线路5");
ok(adminLogListSource.includes('if (line === "line5") return "线路5";'), "后台明细应显示线路5");
ok(schemaSource.includes("'line5'"), "Supabase 约束应允许写入线路5");

ok(providerSource.includes('#[serde(rename = "line5")]'), "Rust 生图线路枚举应包含 line5");
ok(providerSource.includes('const LINE5_API_URL: &str = "https://api.apimart.ai/v1/images/generations"'));
ok(providerSource.includes('const LINE5_MODEL: &str = "gpt-image-2"'));
ok(providerSource.includes("APIMART_IMAGE_2_API_KEY"));
ok(apiSource.includes("generate_apimart_image"), "线路5应走 APIMart 专用异步调用分支");
ok(apimartSource.includes("image_urls"), "APIMart 请求体应使用 image_urls 传参考图");
ok(apimartSource.includes('resolution: "1k"'), "APIMart 请求体应固定 resolution=1k");
ok(apimartSource.includes('size == "auto"') && apimartSource.includes('"3:2"'), "APIMart 应把门头 auto 尺寸转为 3:2");
ok(apimartCombinedSource.includes("task_id"), "APIMart 应解析创建任务返回的 task_id");
ok(apimartCombinedSource.includes("/v1/tasks"), "APIMart 应轮询任务接口拿生成结果");
ok(apimartCombinedSource.includes("data:image/jpeg;base64,"), "线路5参考图应压缩为 base64 data URL 后上传");
ok(envExample.includes("APIMART_IMAGE_2_API_KEY="), "环境变量示例应包含线路5密钥");

const sizeSource = read("src/lib/generation-size.ts")
  .replace(/import type \{[\s\S]*?\} from "\.\.\/types";/, "");
const sizeModuleSource = ts.transpileModule(sizeSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const sizeModule = await import(
  `data:text/javascript;base64,${Buffer.from(sizeModuleSource).toString("base64")}`
);

const meituan = {
  id: "meituan",
  poster: { sourceLabel: "21:9" },
  product: { source: { w: 1536, h: 1024 } },
};
const taobao = {
  id: "taobao",
  poster: { sourceLabel: "21:9" },
  product: { source: { w: 1024, h: 1024 } },
};

equal(sizeModule.resolveGenerationSize("avatar", meituan, "line5"), "1:1");
equal(sizeModule.resolveGenerationSize("storefront", meituan, "line5"), "16:9");
equal(sizeModule.resolveGenerationSize("poster", meituan, "line5"), "21:9");
equal(sizeModule.resolveGenerationSize("product", meituan, "line5"), "4:3");
equal(sizeModule.resolveGenerationSize("product", taobao, "line5"), "1:1");
equal(sizeModule.resolveGenerationSize("p_signboard", meituan, "line5"), "auto");

const tauriStubs = `
let calls = [];
async function uploadImageToOss(req) {
  calls.push({ type: "upload", req });
  return { url: "https://oss.example.com/" + req.file_name, key: req.file_name };
}
async function generateImageWithLine(req) {
  calls.push({ type: "generate", req });
  return { image: "abc", generationLine: "line5" };
}
async function compressAndArchiveGenerated(kind, rawBase64, fileNameStem) {
  calls.push({ type: "archive", kind, fileNameStem });
  return "https://oss.example.com/" + fileNameStem + ".jpg";
}
export function __getCalls() { return calls; }
`;

const pictureWallSource = read("src/lib/picture-wall.ts")
  .replace('import { generateImageWithLine, uploadImageToOss } from "./tauri";', tauriStubs)
  .replace('import { compressAndArchiveGenerated } from "./oss-assets";', "")
  .replace(
    'import { runWithAutoRetry } from "./generation-retry";',
    "async function runWithAutoRetry(options) { return { ...(await options.run()), attempt: 1 }; }"
  )
  .replace('import { safeFileName } from "./utils";', "function safeFileName(input) { return input.trim() || 'shop'; }")
  .replace('import type { GenerationItem, GenerationLine, GenerationStatus, UploadedImage } from "../types";', "");
const pictureWallModuleSource = ts.transpileModule(pictureWallSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const pictureWallModule = await import(
  `data:text/javascript;base64,${Buffer.from(pictureWallModuleSource).toString("base64")}`
);

await pictureWallModule.generatePictureWallItem(
  {
    id: "line5-source",
    name: "招牌饭.jpg",
    productName: "招牌饭",
    productBase64: "source-base64",
    mime: "image/jpeg",
  },
  "测试店",
  "line5"
);

const generateCall = pictureWallModule.__getCalls().find((call: { type: string }) => call.type === "generate");
equal(generateCall.req.size, "3:4");
equal(generateCall.req.api_line, "auto");
