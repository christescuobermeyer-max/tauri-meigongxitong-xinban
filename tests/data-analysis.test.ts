import { WORKSPACE_CATALOG, listWorkspaceNavigation } from "../src/lib/workspace-catalog.js";
import { deepEqual, equal, ok } from "node:assert/strict";
import { existsSync } from "node:fs";
import { readProjectFile as readFileSync } from "./helpers/source-tree.mjs";
import { fileURLToPath } from "node:url";
import * as module from "../src/lib/data-analysis.js";
import { EMPTY_TRAFFIC_METRICS, extractTrafficMetrics, formatTrafficRate, parseTrafficCount } from "../src/lib/data-analysis.js";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

equal(existsSync(fileURLToPath(new URL("../src/lib/data-analysis.ts", import.meta.url))), true);
equal(existsSync(fileURLToPath(new URL("../src/hooks/useDataAnalysisWorkspace.ts", import.meta.url))), true);
equal(existsSync(fileURLToPath(new URL("../src/components/DataAnalysisPage.tsx", import.meta.url))), true);

deepEqual(extractTrafficMetrics(`曝光人数 １２，３４５ 人 30,000 次
进店人数
2,345人
下单人数 98 次 67 人`), { exposure: "12345", visits: "2345", orders: "67" });
deepEqual(extractTrafficMetrics("曝光人数 999次\n下单人数 88次"), EMPTY_TRAFFIC_METRICS);
deepEqual(extractTrafficMetrics("曝光人数\n进店人数 50人"), { ...EMPTY_TRAFFIC_METRICS, visits: "50" });
deepEqual(extractTrafficMetrics("曝光人数 1.2万人\n下单人数 0人"), { ...EMPTY_TRAFFIC_METRICS, orders: "0" });
deepEqual(extractTrafficMetrics("曝光人数 15人\n曝光人数 29人"), EMPTY_TRAFFIC_METRICS);
equal(parseTrafficCount("0"), 0);
equal(parseTrafficCount(""), null);
equal(parseTrafficCount("1.2"), null);
equal(formatTrafficRate(12, 300), "4.0%");
equal(formatTrafficRate(12, 0), "—");
equal(formatTrafficRate(13, 12), "—");

equal(module.DATA_ANALYSIS_ASSET_KIND, "data_analysis");
equal(module.DATA_ANALYSIS_PLATFORM, "meituan");

const workspaceSource = read("src/hooks/useGenerationWorkspace.ts");
ok(Object.hasOwn(WORKSPACE_CATALOG, "dataAnalysis"));
ok(workspaceSource.includes("useDataAnalysisWorkspace"));
ok(workspaceSource.includes("dataAnalysisSlots"));
ok(workspaceSource.includes("Object.values(slotGroups).reduce"));

const shellSource = read("src/components/WorkspaceShell.tsx");
ok(shellSource.includes("getWorkspaceTitle(workspace.tab)"));
equal(WORKSPACE_CATALOG.dataAnalysis.title, "数据分析");

const sidebarSource = read("src/components/Sidebar.tsx");
const brandIndex = listWorkspaceNavigation(true).findIndex((item) => item.key === "brandStory");
const dataIndex = listWorkspaceNavigation(true).findIndex((item) => item.key === "dataAnalysis");
ok(brandIndex > -1);
ok(dataIndex > brandIndex);
ok(listWorkspaceNavigation(true).some((item) => item.label === "数据分析"));

const pagesSource = read("src/components/WorkspacePages.tsx");
ok(pagesSource.includes('workspace.tab === "dataAnalysis"'));
ok(pagesSource.includes("<DataAnalysisWorkspacePage"));
ok(pagesSource.includes("workspace.dataAnalysisSlots"));

const dataAnalysisPageSource = read("src/components/DataAnalysisPage.tsx");
ok(dataAnalysisPageSource.includes("data-analysis-result-hero"));
ok(dataAnalysisPageSource.includes("data-analysis-result-hero__kicker"));
ok(dataAnalysisPageSource.includes("专业分析交付区"));
ok(dataAnalysisPageSource.includes("识别截图数据"));
ok(dataAnalysisPageSource.includes("data-analysis-result-hero__metric"));
ok(dataAnalysisPageSource.includes("OSS归档"));
ok(dataAnalysisPageSource.includes("云端记录"));

const globalCssSource = read("src/styles/global.css");
ok(globalCssSource.includes(".data-analysis-result-hero"));
ok(globalCssSource.includes(".data-analysis-result-hero__metrics"));

const hookSource = read("src/hooks/useDataAnalysisWorkspace.ts");
ok(hookSource.includes("renderDataAnalysisImage(snapshot.storeName, snapshot.metrics)"));
ok(hookSource.includes("base64_data: output.base64"));
ok(!hookSource.includes("generateArchivedImageWithLine"));
ok(!hookSource.includes("product_images"));
ok(hookSource.includes("DATA_ANALYSIS_ASSET_KIND"));
ok(hookSource.includes("onRecordHistory"));
ok(hookSource.includes("remoteUrl"));
ok(hookSource.includes("data-analysis"));
ok(hookSource.includes("DATA_ANALYSIS_PLATFORM"));

const typesSource = read("src/types.ts");
ok(typesSource.includes('"data_analysis"'));

const supabaseSource = read("src/lib/supabase.ts");
ok(supabaseSource.includes('"data_analysis"'));
ok(supabaseSource.includes("data_analysis_count"));

const ossAssetsSource = read("src/lib/oss-assets.ts");
ok(ossAssetsSource.includes("data_analysis:"));

const historySource = read("src/lib/history.ts");
ok(historySource.includes('kind === "data_analysis"'));
ok(historySource.includes('"数据分析"'));
ok(historySource.includes("data-analysis"));

const historyDownloadSource = read("src/lib/history-download.ts");
ok(historyDownloadSource.includes('entry.kind === "data_analysis"'));
ok(historyDownloadSource.includes("DATA_ANALYSIS_EXPORT_SIZE"));

const adminFilterSource = read("src/lib/admin-log-filters.ts");
ok(adminFilterSource.includes('data_analysis: "数据分析"'));

const adminStatsSource = read("src/lib/admin-stats.ts");
ok(adminStatsSource.includes("data_analysis_count"));

const adminDetailSource = read("src/components/admin/AdminGenerationDetail.tsx");
ok(adminDetailSource.includes('"数据分析"'));
ok(adminDetailSource.includes("data_analysis_count"));

const schemaSource = read("supabase/schema.sql");
ok(schemaSource.includes("'data_analysis'"));
ok(schemaSource.includes("data_analysis_count"));

const migrationSource = read("supabase/migrations/20260514_add_data_analysis_asset_kind.sql");
ok(migrationSource.includes("'data_analysis'"));
ok(migrationSource.includes("data_analysis_count"));

const generationPrompts = JSON.parse(read("prompt-templates/generation-prompts.json")) as {
  templates: Record<string, string>;
};
const cloudDataAnalysisPrompt = generationPrompts.templates.data_analysis;
ok(cloudDataAnalysisPrompt.includes("截图只作为读取和核实数据的资料"));
ok(cloudDataAnalysisPrompt.includes("禁止原样输出、复刻、描摹、嵌入或拼贴整张截图"));
ok(cloudDataAnalysisPrompt.includes("不得退回展示原截图"));
