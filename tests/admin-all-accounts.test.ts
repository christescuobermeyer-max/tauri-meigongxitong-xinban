import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const adminSource = readFileSync(new URL("../src/lib/admin.ts", import.meta.url), "utf8");
const adminPageSource = readFileSync(new URL("../src/components/AdminPage.tsx", import.meta.url), "utf8");
const accountsTableSource = readFileSync(
  new URL("../src/components/admin/AdminAccountsTable.tsx", import.meta.url),
  "utf8"
);
const adminDetailSource = readFileSync(
  new URL("../src/components/admin/AdminGenerationDetail.tsx", import.meta.url),
  "utf8"
);
const cloudHistorySource = readFileSync(
  new URL("../src/lib/cloud-history.ts", import.meta.url),
  "utf8"
);
const supabaseTypesSource = readFileSync(
  new URL("../src/lib/supabase.ts", import.meta.url),
  "utf8"
);
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../supabase/migrations/20260515_add_generation_totals.sql", import.meta.url),
  "utf8"
);

ok(adminSource.includes("ALL_ACCOUNTS_ID"), "后台数据层应定义所有账户选项 ID");
ok(adminSource.includes("buildAllAccountsSummary"), "后台应构建所有账户汇总行");
ok(adminSource.includes("fetchPermanentGenerationTotals"), "累计生图应读取永久累计表");
ok(adminSource.includes('.from("generation_totals")'), "后台累计生图不应再从 7 天历史表统计");
ok(adminSource.includes("fetchExactTodayGenerationCount"), "今日生图仍应使用当天历史记录精确 count");
ok(!adminSource.includes(".limit(20000)"), "累计生图不应再依赖最多 20000 条日志的前端累加");
ok(
  adminSource.includes("fetchExactTodayGenerationCount") &&
    adminSource.includes("if (userId !== ALL_ACCOUNTS_ID)") &&
    adminSource.includes(".eq(\"user_id\", userId)"),
  "今日单用户查询应保留 user_id 过滤，所有账户查询应跳过该过滤"
);
ok(adminSource.includes("aggregateDailyStatRows"), "所有账户每日统计应按日期汇总各用户统计行");
ok(adminSource.includes(".gte(\"stat_day\", cutoffDay)"), "所有账户每日统计应按日期范围读取，而不是只 limit 天数");
ok(cloudHistorySource.includes('.from("generation_totals")'), "顶部总生图应读取永久累计表");
ok(supabaseTypesSource.includes("GenerationTotalRow"), "Supabase 类型应包含永久累计行");
ok(schemaSource.includes("create table if not exists public.generation_totals"));
ok(schemaSource.includes("increment_generation_total"));
ok(schemaSource.includes("after insert on public.generation_logs"));
ok(migrationSource.includes("create table if not exists public.generation_totals"));
ok(migrationSource.includes("insert into public.generation_totals"));
ok(migrationSource.includes("after insert on public.generation_logs"));

ok(adminPageSource.includes('useState<string>(ALL_ACCOUNTS_ID)'), "后台默认应选中所有账户");
ok(adminPageSource.includes("buildAllAccountsSummary(accounts)"), "后台页面应把所有账户汇总行传给账号列表");
ok(adminPageSource.includes("accountNameById"), "所有账户明细应能显示日志所属账号");

ok(accountsTableSource.includes("所有账户"), "账号列表应渲染所有账户选项");
ok(accountsTableSource.includes("account.is_all"), "账号列表应识别汇总行并调整展示");

ok(adminDetailSource.includes("accountNameById"), "后台明细应接收账号名称映射");
ok(adminDetailSource.includes("showAccountName"), "选择所有账户时明细应显示每张图所属账号");
equal(adminDetailSource.includes("从左侧选择一个账号查看其生图记录"), false);
