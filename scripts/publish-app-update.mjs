import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const CONTENT_TYPE = "application/octet-stream";
const SIGNED_URL_TTL_SECONDS = 365 * 24 * 60 * 60;

function requiredEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`缺少环境变量：${names.join(" / ")}`);
}

function releaseConfig() {
  const region = requiredEnv("ALI_OSS_REGION");
  return {
    bucket: requiredEnv("ALI_OSS_BUCKET"),
    accessKeyId: requiredEnv("ALI_OSS_ACCESS_KEY_ID"),
    accessKeySecret: requiredEnv("ALI_OSS_ACCESS_KEY_SECRET"),
    endpoint: region.includes("aliyuncs.com")
      ? region.replace(/^https?:\/\//, "").replace(/\/$/, "")
      : `${region}.aliyuncs.com`,
    supabaseUrl: requiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/$/, ""),
    supabaseAnonKey: requiredEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
    supabaseServiceKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function assertVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    throw new Error(`版本号格式无效：${version ?? ""}`);
  }
}

function ossAuthorization(config, method, objectKey, contentType, dateOrExpires) {
  const canonical = [
    method,
    "",
    contentType,
    dateOrExpires,
    `/${config.bucket}/${objectKey}`,
  ].join("\n");
  const signature = crypto
    .createHmac("sha1", config.accessKeySecret)
    .update(canonical)
    .digest("base64");
  return `OSS ${config.accessKeyId}:${signature}`;
}

function objectUrl(config, objectKey) {
  return `https://${config.bucket}.${config.endpoint}/${objectKey}`;
}

function signedDownloadUrl(config, objectKey) {
  const expires = String(Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS);
  const authorization = ossAuthorization(config, "GET", objectKey, "", expires);
  const signature = authorization.slice(authorization.indexOf(":") + 1);
  const url = new URL(objectUrl(config, objectKey));
  url.searchParams.set("OSSAccessKeyId", config.accessKeyId);
  url.searchParams.set("Expires", expires);
  url.searchParams.set("Signature", signature);
  return url.toString();
}

async function uploadArtifact(config, filePath, objectKey) {
  const bytes = await fs.readFile(filePath);
  const date = new Date().toUTCString();
  const response = await fetch(objectUrl(config, objectKey), {
    method: "PUT",
    headers: {
      Date: date,
      "Content-Type": CONTENT_TYPE,
      "Content-Length": String(bytes.length),
      Authorization: ossAuthorization(config, "PUT", objectKey, CONTENT_TYPE, date),
    },
    body: bytes,
  });
  if (response.status !== 200 && response.status !== 204) {
    throw new Error(`OSS 上传失败：HTTP ${response.status}`);
  }

  const downloadUrl = signedDownloadUrl(config, objectKey);
  const verifyResponse = await fetch(downloadUrl, {
    headers: {
      Range: "bytes=0-0",
      Origin: "https://gw.hbcsch.pw",
    },
  }).catch(() => null);
  if (!verifyResponse || ![200, 206].includes(verifyResponse.status)) {
    throw new Error(`OSS 下载验证失败：HTTP ${verifyResponse?.status ?? "NETWORK_ERROR"}`);
  }
  await verifyResponse.arrayBuffer();

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  console.log(JSON.stringify({
    action: "upload",
    objectKey,
    bytes: bytes.length,
    sha256,
    putStatus: response.status,
    rangeStatus: verifyResponse.status,
    cors: verifyResponse.headers.get("access-control-allow-origin") ?? "",
  }));
  return downloadUrl;
}

async function updateConfig(config, patch) {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/app_update_config?id=eq.desktop`,
    {
      method: "PATCH",
      headers: {
        apikey: config.supabaseServiceKey,
        Authorization: `Bearer ${config.supabaseServiceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    },
  );
  if (!response.ok) {
    throw new Error(`Supabase 更新失败：HTTP ${response.status}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Supabase 更新结果异常：返回 ${Array.isArray(rows) ? rows.length : 0} 行`);
  }
  return rows[0];
}

async function readPublicStatus(config) {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/app_update_config?select=id,latest_version,force_update,installer_url,release_notes,updated_at&id=eq.desktop`,
    { headers: { apikey: config.supabaseAnonKey } },
  );
  if (!response.ok) {
    throw new Error(`Supabase 公开读取失败：HTTP ${response.status}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Supabase 公开更新配置不存在");
  }
  const row = rows[0];
  let installerObject = "";
  try {
    installerObject = new URL(row.installer_url).pathname.replace(/^\//, "");
  } catch {
    installerObject = "INVALID_URL";
  }
  const status = {
    id: row.id,
    latestVersion: row.latest_version,
    forceUpdate: row.force_update,
    hasInstallerUrl: Boolean(row.installer_url),
    installerObject,
    releaseNotes: row.release_notes,
    updatedAt: row.updated_at,
  };
  console.log(JSON.stringify({ action: "status", ...status }));
  return status;
}

async function stage(config, filePath, version, notesBase64) {
  assertVersion(version);
  if (!filePath) throw new Error("stage 缺少安装包路径");
  const notes = Buffer.from(notesBase64 ?? "", "base64").toString("utf8").trim();
  if (!notes) throw new Error("stage 缺少更新说明");
  const objectKey = `app-updates/${version}/csgh-image-studio-${version}-x64-setup.exe`;
  const installerUrl = await uploadArtifact(config, filePath, objectKey);
  await updateConfig(config, {
    latest_version: version,
    force_update: false,
    installer_url: installerUrl,
    release_notes: notes,
  });
  const status = await readPublicStatus(config);
  if (status.latestVersion !== version || status.forceUpdate || !status.hasInstallerUrl) {
    throw new Error("灰度更新配置验收失败");
  }
}

async function uploadMsi(config, filePath, version) {
  assertVersion(version);
  if (!filePath) throw new Error("upload-msi 缺少安装包路径");
  const objectKey = `app-updates/${version}/csgh-image-studio-${version}-x64-zh-CN.msi`;
  await uploadArtifact(config, filePath, objectKey);
}

async function enable(config, version) {
  assertVersion(version);
  const before = await readPublicStatus(config);
  if (before.latestVersion !== version || !before.hasInstallerUrl) {
    throw new Error(`拒绝启用：云端灰度版本不是 ${version} 或安装包地址为空`);
  }
  await updateConfig(config, { force_update: true });
  const after = await readPublicStatus(config);
  if (after.latestVersion !== version || !after.forceUpdate) {
    throw new Error("强制更新启用验收失败");
  }
}

async function disable(config) {
  await updateConfig(config, { force_update: false });
  const status = await readPublicStatus(config);
  if (status.forceUpdate) throw new Error("暂停强制更新失败");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = releaseConfig();
  if (command === "stage") return stage(config, args[0], args[1], args[2]);
  if (command === "upload-msi") return uploadMsi(config, args[0], args[1]);
  if (command === "enable") return enable(config, args[0]);
  if (command === "disable") return disable(config);
  if (command === "status") return readPublicStatus(config);
  throw new Error("用法：stage <NSIS路径> <版本> <更新说明Base64> | upload-msi <MSI路径> <版本> | enable <版本> | disable | status");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
