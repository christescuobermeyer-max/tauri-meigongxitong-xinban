// 测速：otuapi（候选 line7）vs 已有线路对比基线
//
// 用法：node scripts/diag-otuapi-speed.mjs [rounds]
//   rounds 默认 5，每个尺寸跑 N 次
//
// 输出：每次请求的 elapsed_ms / status / 错误信息，
// 最后给出 min / median / max / mean / success_rate 汇总。

import { writeFile } from "node:fs/promises";

const API_KEY = "sk-FzqsnuwALwXbdpT4TXZPKBo67zkqIXiMpAW5z1MbzWKF2Qm5";
const URL_GEN = "https://otuapi.com/v1/images/generations";
const ROUNDS = Number(process.argv[2] ?? 5);

const TEST_PROMPT =
  "A professional product shot of a delicious takeaway burger meal with crispy fries on a clean white background, soft studio lighting, ultra-high detail, photographic realism";

// 跟生图系统实际常用尺寸一致：
//   1024x1024 = 头像/通用方图
//   1024x1536 = picture_wall (2:3 竖)
//   官方支持 1024x1792 / 1792x1024，先用这两个做基线
const SIZES = ["1024x1024", "1024x1792"];

const CONCURRENT_TEST = 3; // 并发 3 个请求测稳定性

function nowMs() {
  return performance.now();
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function summarize(samples) {
  const ok = samples.filter((s) => s.ok);
  const fail = samples.filter((s) => !s.ok);
  const times = ok.map((s) => s.elapsed_ms).sort((a, b) => a - b);
  if (times.length === 0) {
    return { count: samples.length, success_rate: 0, fail_count: fail.length };
  }
  const median = times[Math.floor(times.length / 2)];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    count: samples.length,
    success_rate: ok.length / samples.length,
    fail_count: fail.length,
    min_ms: times[0],
    median_ms: median,
    mean_ms: mean,
    max_ms: times[times.length - 1],
  };
}

async function callOnce(size, label) {
  const t0 = nowMs();
  try {
    const res = await fetch(URL_GEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "image2",
        prompt: TEST_PROMPT,
        size,
      }),
    });
    const elapsed = nowMs() - t0;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        elapsed_ms: elapsed,
        status: res.status,
        error: text.slice(0, 200),
        label,
      };
    }

    const body = await res.json();
    const data = body?.data?.[0] ?? null;
    const hasB64 = Boolean(data?.b64_json);
    const hasUrl = Boolean(data?.url);
    const b64Len = hasB64 ? data.b64_json.length : 0;

    return {
      ok: true,
      elapsed_ms: elapsed,
      status: res.status,
      has_b64: hasB64,
      has_url: hasUrl,
      b64_chars: b64Len,
      label,
    };
  } catch (err) {
    return {
      ok: false,
      elapsed_ms: nowMs() - t0,
      status: 0,
      error: err?.message ?? String(err),
      label,
    };
  }
}

async function runSerial(size, rounds) {
  console.log(`\n========== 串行测试 size=${size} 轮次=${rounds} ==========`);
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const tag = `serial-${size}-${i + 1}`;
    const r = await callOnce(size, tag);
    samples.push(r);
    console.log(
      `[${tag}] ${r.ok ? "OK" : "FAIL"} status=${r.status} t=${fmtMs(r.elapsed_ms)}${
        r.ok ? ` b64=${r.b64_chars}chars` : ` err=${r.error}`
      }`,
    );
  }
  return samples;
}

async function runConcurrent(size, n) {
  console.log(`\n========== 并发测试 size=${size} 并发数=${n} ==========`);
  const t0 = nowMs();
  const promises = Array.from({ length: n }, (_, i) =>
    callOnce(size, `concurrent-${size}-${i + 1}`),
  );
  const samples = await Promise.all(promises);
  const totalElapsed = nowMs() - t0;
  for (const r of samples) {
    console.log(
      `[${r.label}] ${r.ok ? "OK" : "FAIL"} status=${r.status} t=${fmtMs(r.elapsed_ms)}${
        r.ok ? "" : ` err=${r.error}`
      }`,
    );
  }
  console.log(`==> 并发 ${n} 个请求总耗时：${fmtMs(totalElapsed)}`);
  return samples;
}

(async () => {
  console.log("otuapi 速度 / 稳定性测试");
  console.log(`endpoint: ${URL_GEN}`);
  console.log(`model: image2 | key: ${API_KEY.slice(0, 10)}...${API_KEY.slice(-4)}`);
  console.log(`rounds per size: ${ROUNDS}\n`);

  const allResults = {};

  for (const size of SIZES) {
    const serial = await runSerial(size, ROUNDS);
    const concurrent = await runConcurrent(size, CONCURRENT_TEST);

    const summary = {
      size,
      serial: summarize(serial),
      concurrent: summarize(concurrent),
    };
    allResults[size] = summary;

    console.log(`\n----- ${size} 汇总 -----`);
    console.log("串行：", JSON.stringify(summary.serial, null, 2));
    console.log("并发：", JSON.stringify(summary.concurrent, null, 2));
  }

  const totalOk = Object.values(allResults).reduce(
    (sum, r) => sum + Math.round(r.serial.success_rate * r.serial.count) +
      Math.round(r.concurrent.success_rate * r.concurrent.count),
    0,
  );
  const totalReq = Object.values(allResults).reduce(
    (sum, r) => sum + r.serial.count + r.concurrent.count,
    0,
  );

  console.log(`\n========== 总体 ==========`);
  console.log(`总请求数：${totalReq} | 成功：${totalOk} | 成功率：${((totalOk / totalReq) * 100).toFixed(1)}%`);

  const reportPath = `数据导出/diag-otuapi-${Date.now()}.json`;
  await writeFile(reportPath, JSON.stringify(allResults, null, 2)).catch(() => null);
  console.log(`详细数据已保存：${reportPath}`);
})();
