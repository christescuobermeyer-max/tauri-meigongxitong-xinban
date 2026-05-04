import { supabase, type ProfileRow } from "./supabase";

export interface SignInResult {
  profile: ProfileRow;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(translateAuthError(error.message));
  if (!data.user) throw new Error("登录失败：未返回用户信息");

  const profile = await loadProfile(data.user.id);
  if (!profile) {
    throw new Error("登录成功但未在 profiles 表中找到记录，请联系管理员");
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error("账号已被停用，请联系管理员");
  }

  await recordLogin();
  return { profile };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`读取用户档案失败：${error.message}`);
  return (data as ProfileRow | null) ?? null;
}

export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;
  return loadProfile(userId);
}

async function recordLogin(): Promise<void> {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
  const { error } = await supabase.rpc("record_login", { p_user_agent: userAgent });
  if (error) console.warn("[auth] record_login 失败：", error.message);
}

function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "邮箱或密码不正确";
  if (lower.includes("email not confirmed")) return "邮箱未确认，请联系管理员在 Supabase 后台勾选 Auto Confirm";
  if (lower.includes("too many requests")) return "请求过于频繁，请稍后再试";
  return message;
}
