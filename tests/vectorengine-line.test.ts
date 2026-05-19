import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const typesSource = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
const selectSource = readFileSync(
  new URL("../src/components/GenerationLineSelect.tsx", import.meta.url),
  "utf8"
);
const lineCardSource = readFileSync(
  new URL("../src/components/GenerationLineCard.tsx", import.meta.url),
  "utf8"
);
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
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

equal(typesSource.includes('export type GenerationLine = "line1" | "line2" | "line3" | "line4" | "line5" | "line6";'), true);
equal(selectSource.includes("segmented__meta"), false);
equal(lineCardSource.includes("generation-line-card__hint"), false);
equal(lineCardSource.includes("generation-line-card__notice-engine"), true);
equal(lineCardSource.includes("yunwu"), true);
equal(lineCardSource.includes("pockgo"), true);
equal(lineCardSource.includes("vectorengine"), true);
equal(tauriSource.includes("线路4为 pockgo"), true);
equal(supabaseSource.includes('"line1" | "line2" | "line3" | "line4" | "line5" | "line6" | null'), true);
equal(historySource.includes('if (line === "line3") return "线路3";'), true);
equal(historySource.includes('if (line === "line4") return "线路4";'), true);
equal(adminLogListSource.includes('if (line === "line3") return "线路3";'), true);
equal(adminLogListSource.includes('if (line === "line4") return "线路4";'), true);
equal(adminFiltersSource.includes('line3: "线路3"'), true);
equal(adminFiltersSource.includes('line4: "线路4"'), true);
equal(adminFiltersSource.includes('line5: "线路5"'), true);

equal(imageProviderSource.includes("LINE3_API_URL"), true);
equal(imageProviderSource.includes("https://api.vectorengine.ai/v1/images/generations"), true);
equal(imageProviderSource.includes('#[serde(rename = "line3")]'), true);
equal(imageProviderSource.includes("ImageApiLine::Line3"), true);
equal(imageProviderSource.includes("VECTORENGINE_IMAGE_2_API_KEY"), true);
equal(imageProviderSource.includes('const LINE3_MODEL: &str = "gpt-image-2";'), true);
ok(
  imageProviderSource.includes('const LINE3_EDIT_API_URL: &str = "https://api.vectorengine.ai/v1/images/edits";'),
  "线路3带参考图时应使用 vectorengine 图片编辑接口",
);
ok(
  imageProviderSource.includes("edit_api_url: Some(LINE3_EDIT_API_URL)"),
  "线路3 provider 应配置 edit_api_url 指向 vectorengine edits",
);
ok(
  imageProviderSource.includes("reference_image_json_field: ReferenceImageJsonField::Image"),
  "线路3请求体应使用 image 字段（硬切，不再用 reference_images）",
);
ok(
  apiSource.includes("req.api_line == ImageApiLine::Line3") &&
    apiSource.includes("generate_vectorengine_edit_image"),
  "线路3 存在参考图时应走独立的 vectorengine multipart 编辑分支",
);
ok(apiSource.includes("req.api_line == ImageApiLine::Line4"), "线路4应走 pockgo chat 分支");

equal(envExample.includes("VECTORENGINE_IMAGE_2_API_KEY="), true);
ok(schemaSource.includes("generation_line in ('line1', 'line2', 'line3', 'line4', 'line5', 'line6')"));
