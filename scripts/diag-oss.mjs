/**
 * OSS 全链路诊断：
 * 1. 用本地 .env.local 的凭据连 OSS
 * 2. PUT 一张 1x1 PNG 到 uploads/diag/
 * 3. GET 验证可下载
 * 4. 检测 oss-accelerate 加速域名的连通性
 * 5. 抽几条最近 generation_logs 的 OSS URL，HEAD 看是否真正可访问
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import postgres from "postgres";

const envPath = path.resolve(".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const REGION = process.env.ALI_OSS_REGION || "oss-cn-hangzhou";
const BUCKET = process.env.ALI_OSS_BUCKET;
const AK = process.env.ALI_OSS_ACCESS_KEY_ID;
const SK = process.env.ALI_OSS_ACCESS_KEY_SECRET;
const endpoint = REGION.includes("aliyuncs.com")
  ? REGION.replace(/^https?:\/\//, "")
  : `${REGION}.aliyuncs.com`;

console.log(`[cfg] bucket=${BUCKET} endpoint=${endpoint}`);

function sign(method, ossPath, contentType = "", date) {
  const stringToSign = [
    method,
    "",
    contentType,
    date,
    `/${BUCKET}/${ossPath}`,
  ].join("\n");
  const sig = crypto.createHmac("sha1", SK).update(stringToSign).digest("base64");
  return `OSS ${AK}:${sig}`;
}

async function putObject(host, key, body, contentType) {
  const date = new Date().toUTCString();
  const r = await fetch(`https://${BUCKET}.${host}/${key}`, {
    method: "PUT",
    headers: {
      Date: date,
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      Authorization: sign("PUT", key, contentType, date),
    },
    body,
  });
  return { status: r.status, headers: Object.fromEntries(r.headers) };
}

async function headObject(host, key) {
  const date = new Date().toUTCString();
  const r = await fetch(`https://${BUCKET}.${host}/${key}`, {
    method: "HEAD",
    headers: { Date: date, Authorization: sign("HEAD", key, "", date) },
  });
  return { status: r.status };
}

const ONE_PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pH3sAAAAASUVORK5CYII=",
  "base64",
);

(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const key = `uploads/diag/${stamp}.png`;

  console.log("\n=== ① PUT via 主 endpoint ===");
  const t0 = Date.now();
  try {
    const r = await putObject(endpoint, key, ONE_PX, "image/png");
    console.log(`  HTTP ${r.status}  ${Date.now() - t0}ms`);
    if (r.status === 200 || r.status === 204) console.log("  → 主域名 PUT 成功");
  } catch (e) {
    console.log(`  ❌ 错误: ${e.message}`);
  }

  console.log("\n=== ② PUT via oss-accelerate（线上实际用的）===");
  const t1 = Date.now();
  try {
    const r = await putObject("oss-accelerate.aliyuncs.com", `${key.replace(".png", "-acc.png")}`, ONE_PX, "image/png");
    console.log(`  HTTP ${r.status}  ${Date.now() - t1}ms`);
    if (r.status === 200 || r.status === 204) console.log("  → 加速域名 PUT 成功");
  } catch (e) {
    console.log(`  ❌ 错误: ${e.message}`);
  }

  console.log("\n=== ③ HEAD 刚上传的 key ===");
  try {
    const r = await headObject(endpoint, key);
    console.log(`  HTTP ${r.status}`);
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
  }

  console.log("\n=== ④ 抽 5 条 generation_logs 最近 URL 做 HEAD ===");
  const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
  try {
    const rows = await sql`
      select generation_line, oss_url, created_at
      from public.generation_logs
      order by created_at desc
      limit 5
    `;
    for (const r of rows) {
      const start = Date.now();
      try {
        const resp = await fetch(r.oss_url, { method: "HEAD" });
        console.log(
          `  ${new Date(r.created_at).toISOString()} ${r.generation_line}  HTTP ${resp.status}  ${Date.now() - start}ms  ${r.oss_url.slice(0, 90)}…`,
        );
      } catch (e) {
        console.log(`  ❌ ${r.oss_url.slice(0, 90)} : ${e.message}`);
      }
    }
  } finally {
    await sql.end();
  }

  console.log("\n=== ⑤ 并发 PUT 5 张（模拟批量生图归档）===");
  const tasks = Array.from({ length: 5 }, (_, i) => async () => {
    const k = `uploads/diag/${stamp}-c${i}.png`;
    const s = Date.now();
    const r = await putObject(endpoint, k, ONE_PX, "image/png");
    return { i, status: r.status, ms: Date.now() - s };
  });
  const tstart = Date.now();
  const results = await Promise.all(tasks.map((f) => f()));
  console.log(`  总耗时 ${Date.now() - tstart}ms`);
  for (const r of results) console.log(`  c${r.i}: HTTP ${r.status} / ${r.ms}ms`);
})();
