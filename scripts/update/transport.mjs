import crypto from "node:crypto";
import fs from "node:fs/promises";
import { CONTENT_TYPE, assertInstaller, objectUrl, ossAuthorization, signedDownloadUrl } from "./config.mjs";

export async function fetchHttps(url, options = {}, fetcher = fetch) {
  for (let redirects = 0; redirects <= 10; redirects++) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("安装包及重定向必须使用 HTTPS");
    const response = await fetcher(parsed, { ...options, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("安装包重定向缺少地址");
    url = new URL(location, parsed).toString();
  }
  throw new Error("安装包重定向次数过多");
}

export async function verifyDownload(url, expectedSha256, fetcher = fetch) {
  assertInstaller(url, expectedSha256);
  const response = await fetchHttps(url, { headers: { Origin: "https://gw.hbcsch.pw" } }, fetcher);
  if (response.status !== 200) throw new Error(`安装包校验下载失败：HTTP ${response.status}`);
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  if (!response.body) throw new Error("安装包下载内容为空");
  for await (const chunk of response.body) { hash.update(chunk); bytes += chunk.length; }
  if (!bytes || hash.digest("hex") !== expectedSha256.toLowerCase()) {
    throw new Error("安装包 SHA-256 摘要不匹配，拒绝发布");
  }
  return { status: response.status, bytes };
}

export async function uploadArtifact(config, filePath, objectKey) {
  const bytes = await fs.readFile(filePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const date = new Date().toUTCString();
  const response = await fetch(objectUrl(config, objectKey), {
    method: "PUT", redirect: "error",
    headers: { Date: date, "Content-Type": CONTENT_TYPE, "Content-Length": String(bytes.length),
      Authorization: ossAuthorization(config, "PUT", objectKey, CONTENT_TYPE, date) },
    body: bytes,
  });
  if (![200, 204].includes(response.status)) throw new Error(`OSS 上传失败：HTTP ${response.status}`);
  const installerUrl = signedDownloadUrl(config, objectKey);
  const verified = await verifyDownload(installerUrl, sha256);
  console.log(JSON.stringify({ action: "upload", objectKey, bytes: bytes.length, sha256,
    putStatus: response.status, downloadStatus: verified.status }));
  return { installerUrl, sha256 };
}

export async function updateConfig(config, patch) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/app_update_config?id=eq.desktop`, {
    method: "PATCH", redirect: "error",
    headers: { apikey: config.supabaseServiceKey, Authorization: `Bearer ${config.supabaseServiceKey}`,
      "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Supabase 更新失败：HTTP ${response.status}，请确认更新配置迁移已执行`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Supabase 更新结果异常");
  return rows[0];
}

export async function readUpdateRow(config) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/app_update_config?select=*&id=eq.desktop`, {
    redirect: "error", headers: { apikey: config.supabaseAnonKey },
  });
  if (!response.ok) throw new Error(`Supabase 公开读取失败：HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Supabase 公开更新配置不存在");
  return rows[0];
}

export async function readPublicStatus(config) {
  const row = await readUpdateRow(config);
  let installerObject = "";
  try { installerObject = new URL(row.installer_url).pathname.replace(/^\//, ""); } catch { installerObject = "INVALID_URL"; }
  const status = { id: row.id, latestVersion: row.latest_version, forceUpdate: row.force_update,
    updateEnabled: row.update_enabled ?? row.force_update, hasInstallerUrl: Boolean(row.installer_url),
    installerSha256: row.installer_sha256 ?? null, installerObject, releaseNotes: row.release_notes, updatedAt: row.updated_at };
  console.log(JSON.stringify({ action: "status", ...status }));
  return status;
}
