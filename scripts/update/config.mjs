import crypto from "node:crypto";

export const CONTENT_TYPE = "application/octet-stream";
const SIGNED_URL_TTL_SECONDS = 365 * 24 * 60 * 60;

export function releaseConfig(env = process.env) {
  function requiredEnv(...names) {
    const value = names.map((name) => env[name]?.trim()).find(Boolean);
    if (!value) throw new Error(`缺少环境变量：${names.join(" / ")}`);
    return value;
  }
  const region = requiredEnv("ALI_OSS_REGION");
  return {
    bucket: requiredEnv("ALI_OSS_BUCKET"),
    accessKeyId: requiredEnv("ALI_OSS_ACCESS_KEY_ID"),
    accessKeySecret: requiredEnv("ALI_OSS_ACCESS_KEY_SECRET"),
    endpoint: region.includes("aliyuncs.com")
      ? region.replace(/^https?:\/\//, "").replace(/\/$/, "") : `${region}.aliyuncs.com`,
    supabaseUrl: requiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/$/, ""),
    supabaseAnonKey: requiredEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
    supabaseServiceKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function assertVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error("版本号格式无效");
}

export function assertInstaller(url, digest) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("安装包地址无效"); }
  if (parsed.protocol !== "https:") throw new Error("安装包必须使用 HTTPS 地址");
  if (!/\.(exe|msi)$/i.test(parsed.pathname)) throw new Error("安装包只支持 .exe 或 .msi 文件");
  if (!/^[a-f0-9]{64}$/i.test(digest ?? "")) throw new Error("安装包缺少有效 SHA-256 摘要");
}

export function ossAuthorization(config, method, objectKey, contentType, dateOrExpires) {
  const canonical = [method, "", contentType, dateOrExpires, `/${config.bucket}/${objectKey}`].join("\n");
  const signature = crypto.createHmac("sha1", config.accessKeySecret).update(canonical).digest("base64");
  return `OSS ${config.accessKeyId}:${signature}`;
}

export function objectUrl(config, objectKey) {
  return `https://${config.bucket}.${config.endpoint}/${objectKey}`;
}

export function signedDownloadUrl(config, objectKey) {
  const expires = String(Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS);
  const authorization = ossAuthorization(config, "GET", objectKey, "", expires);
  const url = new URL(objectUrl(config, objectKey));
  url.searchParams.set("OSSAccessKeyId", config.accessKeyId);
  url.searchParams.set("Expires", expires);
  url.searchParams.set("Signature", authorization.slice(authorization.indexOf(":") + 1));
  return url.toString();
}
