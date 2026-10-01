import { equal, match } from "node:assert/strict";
import { resolveAvailableUpdate, type AppUpdateConfigRow } from "../../src/lib/app-update.js";

const row: AppUpdateConfigRow = {
  id: "desktop", latest_version: "4.0.0", force_update: true,
  installer_url: "https://downloads.example.test/app.exe", release_notes: "测试更新",
  updated_at: "2026-09-30T00:00:00Z",
};
const digest = "a".repeat(64);

equal(resolveAvailableUpdate({ ...row, update_enabled: false }, "3.0.0"), null);
equal(resolveAvailableUpdate({ ...row, force_update: false }, "3.0.0"), null);
const legacy = resolveAvailableUpdate(row, "3.0.0")!;
equal(legacy.latestVersion, "4.0.0");
equal(legacy.installerSha256, null);
match(legacy.installBlockedReason!, /摘要/);
equal(resolveAvailableUpdate({ ...row, installer_sha256: digest }, "3.0.0")?.installBlockedReason, null);
equal(resolveAvailableUpdate({ ...row, update_enabled: true, force_update: false, installer_sha256: digest }, "3.0.0")?.installerSha256, digest);
match(resolveAvailableUpdate({ ...row, installer_sha256: "a".repeat(63) }, "3.0.0")!.installBlockedReason!, /摘要/);
match(resolveAvailableUpdate({ ...row, installer_sha256: digest, installer_url: "http://downloads.example.test/app.exe" }, "3.0.0")!.installBlockedReason!, /HTTPS/);
match(resolveAvailableUpdate({ ...row, installer_sha256: digest, installer_url: "https://downloads.example.test/app.zip" }, "3.0.0")!.installBlockedReason!, /安装包/);
console.log("更新配置完整性验证通过");
