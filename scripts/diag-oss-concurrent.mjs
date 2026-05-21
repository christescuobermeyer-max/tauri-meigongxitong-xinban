/**
 * OSS 极端并发测试：模拟 7 运营 × 5 店铺 = 35 路并发 PUT。
 * 每个对象 250KB 接近真实生图的压缩后大小。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const envPath = path.resolve(".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const REGION = process.env.ALI_OSS_REGION;
const BUCKET = process.env.ALI_OSS_BUCKET;
const AK = process.env.ALI_OSS_ACCESS_KEY_ID;
const SK = process.env.ALI_OSS_ACCESS_KEY_SECRET;
const HOST = "oss-accelerate.aliyuncs.com";

function sign(method, key, contentType, date) {
  const stringToSign = [method, "", contentType, date, `/${BUCKET}/${key}`].join("\n");
  return `OSS ${AK}:${crypto.createHmac("sha1", SK).update(stringToSign).digest("base64")}`;
}

const PAYLOAD = Buffer.alloc(250 * 1024, 0x42);

async function putOne(i) {
  const key = `uploads/diag-conc/${Date.now()}-${i}-${crypto.randomBytes(4).toString("hex")}.bin`;
  const date = new Date().toUTCString();
  const t0 = Date.now();
  const r = await fetch(`https://${BUCKET}.${HOST}/${key}`, {
    method: "PUT",
    headers: {
      Date: date,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(PAYLOAD.length),
      Authorization: sign("PUT", key, "application/octet-stream", date),
    },
    body: PAYLOAD,
  });
  return { i, status: r.status, ms: Date.now() - t0 };
}

async function runBatch(n) {
  console.log(`\n=== 并发 ${n} 路 PUT（每个 250KB）===`);
  const start = Date.now();
  const results = await Promise.all(Array.from({ length: n }, (_, i) => putOne(i)));
  const total = Date.now() - start;
  const ok = results.filter((r) => r.status === 200 || r.status === 204).length;
  const fastest = Math.min(...results.map((r) => r.ms));
  const slowest = Math.max(...results.map((r) => r.ms));
  const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  console.log(`  成功 ${ok}/${n}  总耗时 ${total}ms`);
  console.log(`  单请求: 最快=${fastest}ms / 平均=${avg}ms / 最慢=${slowest}ms`);
  console.log(`  实际吞吐: ${((n * 250) / (total / 1000)).toFixed(1)} KB/s`);
  return { ok, n, total };
}

(async () => {
  await runBatch(5);
  await runBatch(20);
  await runBatch(35); // 7 运营 × 5 店铺
  await runBatch(70); // 7 运营 × 5 店铺 × 2 个工具同时
})();
