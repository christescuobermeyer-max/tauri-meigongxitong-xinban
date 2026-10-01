import { deepEqual, equal, rejects, throws } from "node:assert/strict";

Object.assign(process.env, {
  ALI_OSS_REGION: "oss-test", ALI_OSS_BUCKET: "test", ALI_OSS_ACCESS_KEY_ID: "fake",
  ALI_OSS_ACCESS_KEY_SECRET: "fake", SUPABASE_URL: "https://db.example.test",
  SUPABASE_ANON_KEY: "fake", SUPABASE_SERVICE_ROLE_KEY: "fake",
});
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error("禁止测试联网"); };
const publisher = await import("../../scripts/publish-app-update.mjs");
await Promise.resolve();
equal(process.exitCode, undefined, "导入发布模块不能执行 CLI");
equal(calls, 0, "导入发布模块不能联网");

const digest = "b".repeat(64);
let row = { id: "desktop", latest_version: "3.0.0", installer_url: "", force_update: true };
const patches = [];
const dependencies = {
  uploadArtifact: async () => ({ installerUrl: "https://downloads.example.test/app.exe", sha256: digest }),
  updateConfig: async (_config, patch) => { patches.push(patch); row = { ...row, ...patch }; return row; },
  readUpdateRow: async () => row,
  verifyDownload: async (_url, hash) => { equal(hash, digest); },
};
const notes = Buffer.from("离线测试更新说明").toString("base64");
await publisher.stage({}, "fixture.exe", "4.0.0", notes, dependencies);
equal(row.update_enabled, false);
equal(row.force_update, false);
equal(row.installer_sha256, digest);
await publisher.enable({}, "4.0.0", dependencies);
deepEqual(patches.at(-1), { update_enabled: true, force_update: true });
await publisher.disable({}, dependencies);
deepEqual(patches.at(-1), { update_enabled: false, force_update: false });
row.installer_sha256 = null;
await rejects(publisher.enable({}, "4.0.0", dependencies), /摘要/);
row.installer_sha256 = digest;
row.installer_url = "http://downloads.example.test/app.exe";
await rejects(publisher.enable({}, "4.0.0", dependencies), /HTTPS/);
equal(calls, 0);
console.log("更新发布离线行为验证通过");

const { assertCommitted } = await import("../../scripts/update/git-guard.mjs");
const fakeGit = (status, ahead) => (args) => (args[0] === "status" ? status : ahead);
throws(() => assertCommitted(fakeGit(" M src/App.tsx", "0")), /未提交/);
assertCommitted(fakeGit("", "0"));
console.log("发布前提交检查验证通过");
