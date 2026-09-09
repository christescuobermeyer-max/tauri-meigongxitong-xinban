import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const authSource = readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
const useAuthSource = readFileSync(new URL("../src/hooks/useAuth.ts", import.meta.url), "utf8");

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
ok(
  useAuthSource.includes("previous.profile"),
  "定时校验 profile 遇到临时网络/数据库错误时应保留当前工作区，避免无人值守生图被重置"
);
ok(
  useAuthSource.includes('message.includes("账号已被停用")'),
  "账号确实被停用时仍必须清空登录态"
);
