import { deepEqual, equal } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  compareVersions,
  resolveMandatoryUpdate,
  type AppUpdateConfigRow,
} from "../src/lib/app-update.js";

equal(compareVersions("3.0.1", "3.0.0"), 1);
equal(compareVersions("3.0.0", "3.0.0"), 0);
equal(compareVersions("3.0.0", "3.0.1"), -1);
equal(compareVersions("3.0.0", "3.0.0-beta.1"), 0);
equal(compareVersions("3.10.0", "3.9.9"), 1);

const mandatoryRow: AppUpdateConfigRow = {
  id: "desktop",
  latest_version: "3.1.0",
  force_update: true,
  installer_url: "https://oss.example.com/csgh-3.1.0.msi",
  release_notes: "新增强制更新\n修复线路状态",
  updated_at: "2026-06-18T00:00:00Z",
};

deepEqual(resolveMandatoryUpdate(mandatoryRow, "3.0.0"), {
  latestVersion: "3.1.0",
  installerUrl: "https://oss.example.com/csgh-3.1.0.msi",
  releaseNotes: ["新增强制更新", "修复线路状态"],
});
equal(resolveMandatoryUpdate(mandatoryRow, "3.1.0"), null);
equal(resolveMandatoryUpdate({ ...mandatoryRow, force_update: false }, "3.0.0"), null);
equal(resolveMandatoryUpdate({ ...mandatoryRow, installer_url: "" }, "3.0.0"), null);

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const componentUrl = new URL("../src/components/MandatoryUpdateGate.tsx", import.meta.url);
const tauriSource = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const rustUpdateSource = readFileSync(new URL("../src-tauri/src/app_update.rs", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
const migrationUrl = new URL("../supabase/migrations/20260618_add_app_update_config.sql", import.meta.url);

equal(appSource.includes("<MandatoryUpdateGate suspend={workspaceBusy} />"), true);
equal(existsSync(fileURLToPath(componentUrl)), true);

const componentSource = readFileSync(componentUrl, "utf8");
equal(componentSource.includes("suspend?: boolean"), true);
equal(componentSource.includes("if (suspend) return"), true);
equal(componentSource.includes("检测到新版本"), true);
equal(componentSource.includes("自动更新"), true);
equal(componentSource.includes("installAppUpdate"), true);
equal(componentSource.includes("listenAppUpdateProgress"), true);
equal(componentSource.includes('role="progressbar"'), true);
equal(componentSource.includes("mandatory-update__progress-bar"), true);
equal(globalStyles.includes(".mandatory-update__dialog"), true);
equal(globalStyles.includes(".mandatory-update__progress"), true);
equal(globalStyles.includes(".mandatory-update__progress-bar"), true);
equal(globalStyles.includes("background: #fff7ed;"), true);
equal(globalStyles.includes("color: #1f2937;"), true);
equal(globalStyles.includes("background: #ffffff;"), true);
equal(globalStyles.includes("color: #4b5563;"), true);
equal(globalStyles.includes("background: rgba(17, 24, 39, 0.82);"), true);

equal(tauriSource.includes("install_app_update"), true);
equal(tauriSource.includes("listenAppUpdateProgress"), true);
equal(tauriSource.includes("app-update://progress"), true);
equal(rustUpdateSource.includes("AppUpdateProgressPayload"), true);
equal(rustUpdateSource.includes("app-update://progress"), true);
equal(rustUpdateSource.includes("emit_update_progress"), true);
equal(rustUpdateSource.includes("reopen_after_install"), true);
equal(schemaSource.includes("create table if not exists public.app_update_config"), true);
equal(schemaSource.includes("app_update_config: public read"), true);
equal(existsSync(fileURLToPath(migrationUrl)), true);
