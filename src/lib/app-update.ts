import { supabase } from "./supabase";

export interface AppUpdateConfigRow {
  id: string;
  latest_version: string;
  force_update: boolean;
  installer_url: string;
  release_notes: string | null;
  updated_at: string;
}

export interface MandatoryUpdateInfo {
  latestVersion: string;
  installerUrl: string;
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

  const latestVersion = row.latest_version.trim();
  const installerUrl = row.installer_url.trim();
  if (!latestVersion || !installerUrl) return null;
  if (compareVersions(latestVersion, currentVersion) <= 0) return null;

  return {
    latestVersion,
    installerUrl,
    releaseNotes: parseReleaseNotes(row.release_notes),
  };
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
  const { data, error } = await supabase
    .from("app_update_config")
    .select("id,latest_version,force_update,installer_url,release_notes,updated_at")
    .eq("id", "desktop")
    .maybeSingle();

  if (error) throw new Error(`检查软件更新失败：${error.message}`);
  return resolveMandatoryUpdate(data as AppUpdateConfigRow | null, currentVersion);
}
