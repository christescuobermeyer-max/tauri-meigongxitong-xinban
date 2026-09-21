import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const typesSource = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
const tauriSource = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const supabaseSource = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../src/components/HistoryPanel.tsx", import.meta.url), "utf8");
const adminDetailSource = readFileSync(
  new URL("../src/components/admin/AdminGenerationDetail.tsx", import.meta.url),
  "utf8"
);
const adminLogListSource = readFileSync(
  new URL("../src/components/admin/AdminGenerationLogList.tsx", import.meta.url),
  "utf8"
);
const adminFiltersSource = readFileSync(
  new URL("../src/lib/admin-log-filters.ts", import.meta.url),
  "utf8"
);
const imageProviderSource = readFileSync(
  new URL("../src-tauri/src/image_provider.rs", import.meta.url),
  "utf8"
);
const apiSource = readFileSync(new URL("../src-tauri/src/api.rs", import.meta.url), "utf8");
const vectorengineEditSource = readFileSync(
  new URL("../src-tauri/src/vectorengine_edit.rs", import.meta.url),
  "utf8"
);
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

equal(typesSource.includes('export type GenerationLine = "line2" | "line3" | "line4" | "line5" | "line6" | "line7";'), true);
equal(typesSource.includes('export type HistoricalGenerationLine = "line1" | GenerationLine;'), true);
equal(tauriSource.includes("线路2/3/4复用 Zikl 上游"), true);
equal(supabaseSource.includes("generation_line: HistoricalGenerationLine | null"), true);
equal(historySource.includes('if (line === "line3") return "线路3";'), true);
equal(historySource.includes('if (line === "line4") return "线路4";'), true);
equal(adminLogListSource.includes('if (line === "line3") return "线路3";'), true);
equal(adminLogListSource.includes('if (line === "line4") return "线路4";'), true);
equal(adminFiltersSource.includes('line3: "线路3"'), true);
equal(adminFiltersSource.includes('line4: "线路4"'), true);
equal(adminFiltersSource.includes('line5: "线路5"'), true);

equal(imageProviderSource.includes("LINE3_API_URL"), true);
equal(imageProviderSource.includes("https://img.zikl.dev/v1/images/generations"), true);
equal(imageProviderSource.includes('#[serde(rename = "line3")]'), true);
equal(imageProviderSource.includes("ImageApiLine::Line3"), true);
equal(imageProviderSource.includes("VECTORENGINE_IMAGE_2_API_KEY"), true);
equal(imageProviderSource.includes('const LINE3_MODEL: &str = "gpt-image-2.5-flare";'), true);
ok(
  imageProviderSource.includes('const LINE3_EDIT_API_URL: &str = "https://img.zikl.dev/v1/images/edits";'),
  "线路3带参考图时应使用线路2图片编辑接口",
);
ok(
  imageProviderSource.includes("edit_api_url: Some(LINE3_EDIT_API_URL)"),
  "线路3 provider 应配置 edit_api_url 指向线路2 edits",
);
ok(
  imageProviderSource.includes("reference_image_json_field: ReferenceImageJsonField::Image"),
  "线路3请求体应使用 image 字段（硬切，不再用 reference_images）",
);
ok(
  apiSource.includes("req.api_line == ImageApiLine::Line3") &&
    apiSource.includes("generate_vectorengine_edit_image"),
  "线路3 存在参考图时应走线路3 multipart 编辑分支",
);
ok(
  vectorengineEditSource.includes('.text("response_format", "b64_json".to_string())') &&
    !vectorengineEditSource.includes('.text("response_format", "url".to_string())'),
  "线路3 Zikl 编辑应请求 b64_json 响应，避免下载 Zikl 远程图片 URL 失败"
);
ok(
  apiSource.includes("req.api_line == ImageApiLine::Line4") &&
    apiSource.includes("generate_yunwu_edit_image"),
  "线路4应走 Zikl 兼容生图分支"
);
ok(imageProviderSource.includes("LINE7_API_URL"), "应定义线路7 novaeworld API URL");
ok(imageProviderSource.includes("https://api.novaeworld.top/v1/images/generations"), "线路7应使用 novaeworld OpenAI 兼容 generations endpoint");
ok(imageProviderSource.includes("NOVA_IMAGE_2_API_KEY"), "线路7应读取 novaeworld API key 环境变量");

equal(envExample.includes("VECTORENGINE_IMAGE_2_API_KEY="), true);
ok(schemaSource.includes("'line3'") && schemaSource.includes("'line6'"));
