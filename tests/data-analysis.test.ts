import { equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

equal(existsSync(fileURLToPath(new URL("../src/lib/data-analysis.ts", import.meta.url))), true);
equal(existsSync(fileURLToPath(new URL("../src/hooks/useDataAnalysisWorkspace.ts", import.meta.url))), true);
equal(existsSync(fileURLToPath(new URL("../src/components/DataAnalysisPage.tsx", import.meta.url))), true);

const dataAnalysisSource = read("src/lib/data-analysis.ts").replace(
  'import type { GenerationLine } from "../types";',
  ""
);
const transpiled = ts.transpileModule(dataAnalysisSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const prompt = module.buildDataAnalysisPrompt("山饺下");
ok(prompt.includes("山饺下"));
ok(prompt.includes("外卖店铺30天流量数据截图"));
ok(prompt.includes("曝光人数"));
ok(prompt.includes("进店人数"));
ok(prompt.includes("下单人数"));
ok(prompt.includes("不要虚构截图中不存在的具体数值"));
ok(!prompt.includes("图2"));
ok(!prompt.includes("模板参考图"));

equal(module.resolveDataAnalysisSize("line1"), "1536x1024");
equal(module.resolveDataAnalysisSize("line2"), "1536x1024");
equal(module.resolveDataAnalysisSize("line3"), "1536x1024");
equal(module.resolveDataAnalysisSize("line4"), "16:9");
equal(module.resolveDataAnalysisSize("line5"), "16:9");
ok(module.DATA_ANALYSIS_COPY_TEXT.includes("老板"));

equal(module.DATA_ANALYSIS_ASSET_KIND, "data_analysis");
equal(module.DATA_ANALYSIS_PLATFORM, "meituan");

const workspaceSource = read("src/hooks/useGenerationWorkspace.ts");
ok(workspaceSource.includes('| "dataAnalysis"'));
ok(workspaceSource.includes("useDataAnalysisWorkspace"));
ok(workspaceSource.includes("dataAnalysis.busy"));
ok(workspaceSource.includes("dataAnalysis,"));

const shellSource = read("src/components/WorkspaceShell.tsx");
ok(shellSource.includes('workspace.tab === "dataAnalysis"'));
ok(shellSource.includes('"数据分析"'));

const sidebarSource = read("src/components/Sidebar.tsx");
const brandIndex = sidebarSource.indexOf('key: "brandStory"');
const dataIndex = sidebarSource.indexOf('key: "dataAnalysis"');
ok(brandIndex > -1);
ok(dataIndex > brandIndex);
ok(sidebarSource.includes('label: "数据分析"'));

const pagesSource = read("src/components/WorkspacePages.tsx");
ok(pagesSource.includes('workspace.tab === "dataAnalysis"'));
ok(pagesSource.includes("<DataAnalysisPage"));
ok(pagesSource.includes("workspace.dataAnalysis"));

const dataAnalysisPageSource = read("src/components/DataAnalysisPage.tsx");
ok(dataAnalysisPageSource.includes("data-analysis-result-hero"));
ok(dataAnalysisPageSource.includes("data-analysis-result-hero__kicker"));
ok(dataAnalysisPageSource.includes("专业分析交付区"));
ok(dataAnalysisPageSource.includes("data-analysis-result-hero__metric"));
ok(dataAnalysisPageSource.includes("OSS归档"));
ok(dataAnalysisPageSource.includes("云端记录"));

const globalCssSource = read("src/styles/global.css");
ok(globalCssSource.includes(".data-analysis-result-hero"));
ok(globalCssSource.includes(".data-analysis-result-hero__metrics"));

const hookSource = read("src/hooks/useDataAnalysisWorkspace.ts");
ok(hookSource.includes("compressAndArchiveGenerated"));
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
