// 端到端生图测速：模拟客户端走 https://gw.hbcsch.pw/api/generate-image，统计耗时。
// 流程：临时建一个测试账号 → password login 拿 access_token → 跑 N 次生图 → 删账号 + 清理记录。

import fs from "node:fs";
import path from "node:path";

// --- env loader ---
const envPath = path.resolve(".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GATEWAY_URL = process.env.VITE_BACKEND_GATEWAY_URL;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE || !GATEWAY_URL) {
  console.error("缺少环境变量");
  process.exit(1);
}

const TEMP_EMAIL = `speedtest-${Date.now()}@csgh.local`;
const TEMP_PASS = "SpeedTest_2026_Disposable_xyz";

// 3 个常见生图请求样本（覆盖 1:1 / 2:3 / 横版）
const SAMPLES = [
  { label: "头像 1024x1024", size: "1024x1024", prompt: "A simple delicious bowl of noodles on white background, food photography, soft natural light, professional commercial style" },
  { label: "店招 1536x1024", size: "1536x1024", prompt: "A modern restaurant signboard with chinese characters '美味小吃', clean minimalist design, soft warm lighting, commercial style" },
  { label: "海报 1024x1536", size: "1024x1536", prompt: "A vertical food poster with steaming hot pot on dark wooden table, dramatic lighting, professional food photography, vertical composition" },
];

function fmtMs(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function adminApi(method, urlPath, body) {
  const r = await fetch(`${SUPABASE_URL}${urlPath}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${method} ${urlPath} → ${r.status}: ${text}`);
  }
  return r.status === 204 ? null : r.json();
}

async function pgrestExec(method, urlPath, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${urlPath}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok && r.status !== 204) {
    const text = await r.text().catch(() => "");
    throw new Error(`${method} ${urlPath} → ${r.status}: ${text}`);
  }
}

async function createTestUser() {
  console.log("[1] 创建临时测试账号…");
  const user = await adminApi("POST", "/auth/v1/admin/users", {
    email: TEMP_EMAIL,
    password: TEMP_PASS,
    email_confirm: true,
    user_metadata: { display_name: "Speed Test (auto)" },
  });
  console.log(`    ✓ uid=${user.id}\n`);
  return user.id;
}

async function loginAsTestUser() {
  console.log("[2] 用临时账号登录获取 access_token…");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEMP_EMAIL, password: TEMP_PASS }),
  });
  if (!r.ok) throw new Error(`登录失败 ${r.status}: ${await r.text()}`);
  const body = await r.json();
  console.log(`    ✓ token len=${body.access_token.length}\n`);
  return body.access_token;
}

async function generateOne(token, sample) {
  const t0 = performance.now();
  const r = await fetch(`${GATEWAY_URL}/api/generate-image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: sample.prompt,
      size: sample.size,
      product_images: [],
      api_line: "auto",
    }),
  });
  const elapsed = performance.now() - t0;
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { ok: false, elapsed_ms: elapsed, status: r.status, error: text.slice(0, 200) };
  }
  const body = await r.json();
  return {
    ok: true,
    elapsed_ms: elapsed,
    status: r.status,
    line: body.generation_line,
    image_chars: body.image?.length ?? 0,
  };
}

async function cleanup(userId) {
  console.log("\n[5] 清理临时数据…");
  // 删 generation_logs / generation_totals（user_id 关联，但 admin delete user 会 cascade）
  // 但 generation_logs 走 RLS，service_role 绕过；直接调 DELETE
  // daily_generation_stats 是 view 不能直接 delete，删了 generation_logs 后视图自动同步
  await pgrestExec("DELETE", `/generation_logs?user_id=eq.${userId}`);
  await pgrestExec("DELETE", `/generation_totals?user_id=eq.${userId}`);
  await pgrestExec("DELETE", `/login_logs?user_id=eq.${userId}`);
  await pgrestExec("DELETE", `/profiles?id=eq.${userId}`);
  // 最后删 auth.users
  await adminApi("DELETE", `/auth/v1/admin/users/${userId}`);
  console.log("    ✓ 临时账号 + 关联记录已删除");
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  端到端生图测速（走直连网关 + auto 路由）");
  console.log("═══════════════════════════════════════════");
  console.log(`  网关: ${GATEWAY_URL}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log("═══════════════════════════════════════════\n");

  let userId = null;
  try {
    userId = await createTestUser();
    const token = await loginAsTestUser();

    console.log("[3] 串行跑 3 个样本（auto 路由 → 各线路自动分配）…\n");
    const results = [];
    for (let i = 0; i < SAMPLES.length; i++) {
      const sample = SAMPLES[i];
      process.stdout.write(`    [${i + 1}/${SAMPLES.length}] ${sample.label}… `);
      const r = await generateOne(token, sample);
      results.push({ ...sample, ...r });
      if (r.ok) {
        console.log(`✓ ${fmtMs(r.elapsed_ms)} (line=${r.line}, ${r.image_chars} chars)`);
      } else {
        console.log(`✗ FAIL status=${r.status} err=${r.error}`);
      }
    }

    console.log("\n[4] 结果汇总：");
    console.log("    ┌──────────────────┬────────┬──────────┬──────────┐");
    console.log("    │ 样本              │ 状态   │ 耗时     │ 路由线路 │");
    console.log("    ├──────────────────┼────────┼──────────┼──────────┤");
    for (const r of results) {
      const label = r.label.padEnd(16, " ").slice(0, 16);
      const ok = r.ok ? "✓ OK  " : "✗ FAIL";
      const t = fmtMs(r.elapsed_ms).padStart(8, " ");
      const line = (r.line ?? "—").padEnd(8, " ");
      console.log(`    │ ${label} │ ${ok} │ ${t} │ ${line} │`);
    }
    console.log("    └──────────────────┴────────┴──────────┴──────────┘");

    const ok = results.filter((r) => r.ok);
    if (ok.length > 0) {
      const times = ok.map((r) => r.elapsed_ms).sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`\n    成功率: ${ok.length}/${results.length}`);
      console.log(`    最快: ${fmtMs(times[0])} | 中位: ${fmtMs(times[Math.floor(times.length / 2)])} | 最慢: ${fmtMs(times[times.length - 1])} | 均值: ${fmtMs(mean)}`);
    }
  } finally {
    if (userId) {
      await cleanup(userId).catch((err) => {
        console.error("    ⚠️  清理失败：", err.message);
        console.error(`    需手动删除 user_id=${userId}`);
      });
    }
  }
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
