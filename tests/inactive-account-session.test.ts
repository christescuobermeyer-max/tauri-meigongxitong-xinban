import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const authSource = readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8");

const getCurrentProfileMatch = authSource.match(
  /export async function getCurrentProfile[\s\S]*?\n}/
);

ok(getCurrentProfileMatch, "应存在 getCurrentProfile 用于恢复已保存登录态");

const getCurrentProfileSource = getCurrentProfileMatch[0];

ok(
  getCurrentProfileSource.includes("assertActiveProfile(profile)"),
  "恢复已保存登录态时必须校验账号是否仍启用"
);
ok(
  authSource.includes("!profile.is_active"),
  "账号状态校验必须检查 is_active"
);
ok(
  authSource.includes("supabase.auth.signOut()"),
  "恢复到已停用账号时必须清除本机登录态"
);
ok(
  authSource.includes("账号已被停用，请联系管理员"),
  "已停用账号恢复登录态时应返回明确错误"
);
