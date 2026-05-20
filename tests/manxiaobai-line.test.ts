import { ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

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
const adminLogListSource = read("src/components/admin/AdminGenerationLogList.tsx");
const adminFiltersSource = read("src/lib/admin-log-filters.ts");
const schemaSource = read("supabase/schema.sql");
const migrationSource = read("supabase/migrations/20260519_add_generation_line6.sql");
const providerSource = read("src-tauri/src/image_provider.rs");
const apiSource = read("src-tauri/src/api.rs");
const editSource = read("src-tauri/src/manxiaobai_edit.rs");
const lineHealthRsSource = read("src-tauri/src/line_health.rs");
const lineHealthTsSource = read("src/lib/line-health.ts");
const lineHealthBarSource = read("src/components/LineHealthBar.tsx");
const validationSource = read("src-tauri/src/api_validation.rs");

// ---- 前端 ----
ok(typesSource.includes('"line6"'), "前端 GenerationLine 类型应包含线路6");
ok(!cardSource.includes("GenerationLineSelect"), "生图线路卡片不应展示手动线路切换");
ok(cardSource.includes("<LineHealthBar />"), "生图线路卡片应保留线路状态");
ok(topbarSource.includes("自动分配线路"), "顶部栏应显示自动分配线路");
ok(supabaseSource.includes('"line6"'), "云端 generation_logs 类型应允许 line6");
ok(historySource.includes('"line6"'), "本地历史记录类型应允许 line6");
ok(historyPanelSource.includes('"线路6"'), "历史面板应显示线路6");
ok(adminLogListSource.includes('line === "line6"'), "后台管理应识别 line6");
ok(adminFiltersSource.includes('line6: "线路6"'), "后台过滤标签应有 line6");
ok(lineHealthTsSource.includes('"line6"'), "前端 line-health 列表应含 line6");
ok(lineHealthBarSource.includes('"line6"'), "线路状态条应展示 line6");

// ---- 数据库 ----
ok(
  schemaSource.includes(
    "check (generation_line in ('line1', 'line2', 'line3', 'line4', 'line5', 'line6'))"
  ),
  "schema.sql 中 CHECK 约束应包含 line6"
);
ok(
  migrationSource.includes("'line6'"),
  "迁移文件 20260519_add_generation_line6.sql 应存在且包含 line6"
);

// ---- 后端 Rust ----
ok(providerSource.includes("Line6"), "image_provider 应定义 Line6 变体");
ok(
  providerSource.includes("api.manxiaobai.online/v1/images/generations"),
  "line6 generations URL 必须指向 manxiaobai"
);
ok(
  providerSource.includes("api.manxiaobai.online/v1/images/edits"),
  "line6 edit URL 必须指向 manxiaobai"
);
ok(
  providerSource.includes("MANXIAOBAI_IMAGE_2_API_KEY"),
  "image_provider 应读取 MANXIAOBAI_IMAGE_2_API_KEY"
);
ok(
  apiSource.includes("generate_manxiaobai_edit_image"),
  "api.rs 应在 Line6 分支调用 manxiaobai 编辑实现"
);
ok(
  apiSource.includes("ImageApiLine::Line6"),
  "api.rs 应处理 Line6 分支"
);
ok(
  editSource.includes("MAX_ATTEMPTS: usize = 3"),
  "manxiaobai 应做 3 次自动重试（备用线路）"
);
ok(
  editSource.includes("multipart"),
  "manxiaobai 模块应使用 multipart/form-data 调用 edit 接口"
);
ok(
  lineHealthRsSource.includes('"line6"'),
  "后端 line_health.rs 应在 LINES 数组里包含 line6"
);
ok(
  /Line2\s*\|\s*ImageApiLine::Line6|ImageApiLine::Line6\s*\|\s*ImageApiLine::Line2/.test(
    validationSource
  ),
  "api_validation 应让 Line6 走 Line2 同一组 size 白名单"
);

console.log("manxiaobai (line6) contract: OK");
