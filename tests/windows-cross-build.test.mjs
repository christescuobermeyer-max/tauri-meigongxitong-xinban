import { equal, ok, throws } from "node:assert/strict";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "vite";
import { createBuildPlan } from "../scripts/build-windows-from-macos.mjs";

const options = {
  platform: "darwin",
  home: "/Users/test developer",
  root: "/Volumes/NTFS/project",
  env: {
    PATH: "/usr/bin:/bin",
    VITE_BACKEND_GATEWAY_URL: "https://gateway.example.test",
    VITE_SUPABASE_URL: "https://database.example.test",
    VITE_SUPABASE_ANON_KEY: "sb_publishable_test",
    VITE_INTERNAL_SECRET: "must-not-reach-vite",
  },
};
const plan = createBuildPlan(options);
equal(plan.env.CSGH_PUBLIC_BUILD_ONLY, "1");
equal(plan.env.VITE_INTERNAL_SECRET, undefined);
equal(plan.env.VITE_SUPABASE_ANON_KEY, options.env.VITE_SUPABASE_ANON_KEY);
ok(path.isAbsolute(plan.env.CARGO_TARGET_DIR));
ok(!plan.env.CARGO_TARGET_DIR.startsWith(options.root));
equal(JSON.parse(plan.args[plan.args.indexOf("--config") + 1]).bundle.targets, "nsis");
ok(plan.args.includes("x86_64-pc-windows-msvc"));
ok(plan.args.includes("--locked"));
ok(!plan.args.includes("--bundles"), "macOS Tauri CLI rejects --bundles nsis before cross-target resolution");

for (const name of ["VITE_BACKEND_GATEWAY_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
  throws(() => createBuildPlan({ ...options, env: { ...options.env, [name]: "" } }), new RegExp(name));
}
throws(() => createBuildPlan({ ...options, platform: "win32" }), /macOS/);
throws(() => createBuildPlan({ ...options, env: { ...options.env, VITE_BACKEND_GATEWAY_URL: "http://gateway.example.test" } }), /HTTPS/);
throws(() => createBuildPlan({ ...options, env: { ...options.env, VITE_SUPABASE_ANON_KEY: "sb_secret_do-not-print" } }), /公开/);
const serviceToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
throws(() => createBuildPlan({ ...options, env: { ...options.env, VITE_SUPABASE_ANON_KEY: serviceToken } }), /公开/);
const anonToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
equal(createBuildPlan({ ...options, env: { ...options.env, VITE_SUPABASE_ANON_KEY: anonToken } }).env.VITE_SUPABASE_ANON_KEY, anonToken);
const doctor = createBuildPlan({ ...options, env: {}, doctor: true });
ok(doctor.env.PATH.includes("/Users/test developer/.cargo/bin"));
const fixture = mkdtempSync(path.join(os.tmpdir(), "csgh-build-env-test-"));
const previous = process.env.CSGH_PUBLIC_BUILD_ONLY;
try {
  writeFileSync(path.join(fixture, ".env"), "VITE_BUILD_ENV_SENTINEL=must-not-be-loaded\n");
  process.env.CSGH_PUBLIC_BUILD_ONLY = "1";
  const config = await resolveConfig({ root: fixture, configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)) }, "build");
  equal(config.envDir, false);
  equal(config.env.VITE_BUILD_ENV_SENTINEL, undefined, "公开构建必须禁用 Vite 自动加载环境文件");
} finally {
  if (previous === undefined) delete process.env.CSGH_PUBLIC_BUILD_ONLY;
  else process.env.CSGH_PUBLIC_BUILD_ONLY = previous;
  unlinkSync(path.join(fixture, ".env"));
  rmdirSync(fixture);
}
console.log("macOS Windows 构建入口：公开配置、平台限制和独立缓存验证通过");
