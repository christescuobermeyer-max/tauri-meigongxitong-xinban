import { supabase } from "./supabase";

export interface AppUpdateConfigRow {
  id: string;
  latest_version: string;
  force_update: boolean;
  installer_url: string;
  installer_sha256?: string | null;
  update_enabled?: boolean;
  release_notes: string | null;
  updated_at: string;
}

export interface MandatoryUpdateInfo {
  latestVersion: string;
  installerUrl: string;
  installerSha256: string | null;
  installBlockedReason: string | null;
  releaseNotes: string[];
}

export const CURRENT_APP_VERSION =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = parseStableVersion(a);
  const right = parseStableVersion(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

function parseStableVersion(version: string): number[] {
  return version
    .trim()
    .split(/[+-]/)[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function resolveMandatoryUpdate(
  row: AppUpdateConfigRow | null,
  currentVersion = CURRENT_APP_VERSION
): MandatoryUpdateInfo | null {
  if (!row?.force_update) return null;

  return resolveAvailableUpdate(row, currentVersion);
}

/** 启动时提示有新版本，但不阻塞用户继续使用。 */
export function resolveAvailableUpdate(
  row: AppUpdateConfigRow | null,
  currentVersion = CURRENT_APP_VERSION
): MandatoryUpdateInfo | null {
  if (!row || !(row.update_enabled ?? row.force_update)) return null;

  const latestVersion = row.latest_version.trim();
  const installerUrl = row.installer_url.trim();
  if (!latestVersion || !installerUrl) return null;
  if (compareVersions(latestVersion, currentVersion) <= 0) return null;

  return {
    latestVersion,
    installerUrl,
    installerSha256: /^[a-f0-9]{64}$/i.test(row.installer_sha256 ?? "")
      ? row.installer_sha256!.toLowerCase() : null,
    installBlockedReason: validateInstaller(row),
    releaseNotes: parseReleaseNotes(row.release_notes),
  };
}

function validateInstaller(row: AppUpdateConfigRow): string | null {
  if (!/^[a-f0-9]{64}$/i.test(row.installer_sha256 ?? "")) {
    return "安装包缺少有效的 SHA-256 摘要，暂不能自动安装，请联系管理员重新发布。";
  }
  try {
    const url = new URL(row.installer_url.trim());
    if (url.protocol !== "https:") return "安装包必须使用 HTTPS 地址，暂不能自动安装。";
    if (!/\.(exe|msi)$/i.test(url.pathname)) return "安装包只支持 .exe 或 .msi 文件。";
  } catch {
    return "安装包地址无效，暂不能自动安装。";
  }
  return null;
}

function parseReleaseNotes(notes: string | null): string[] {
  return (notes ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function fetchMandatoryUpdate(
  currentVersion = CURRENT_APP_VERSION
): Promise<MandatoryUpdateInfo | null> {
  return resolveMandatoryUpdate(await fetchUpdateConfig(), currentVersion);
}

export async function fetchAvailableUpdate(
  currentVersion = CURRENT_APP_VERSION
): Promise<MandatoryUpdateInfo | null> {
  return resolveAvailableUpdate(await fetchUpdateConfig(), currentVersion);
}

async function fetchUpdateConfig(): Promise<AppUpdateConfigRow | null> {
  const { data, error } = await supabase
    .from("app_update_config")
    // 读取已有列，旧数据库尚未迁移时仍可显示版本并禁止无摘要安装。
    .select("*")
    .eq("id", "desktop")
    .maybeSingle();

  if (error) throw new Error("检查软件更新失败：" + error.message);
  return data as AppUpdateConfigRow | null;
}
