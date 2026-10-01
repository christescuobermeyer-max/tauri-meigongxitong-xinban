import { createDataTasks } from "./export/user-day/data.mjs";
import { createOutputTasks } from "./export/user-day/output.mjs";
import { main } from "./export/user-day/main.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";

loadEnvFile(path.resolve(".env.local"));

const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

const [, , userNameArg, dateArg, outputArg] = process.argv;

const USER_NAME = (userNameArg || "杨有淇").trim();
const SHANGHAI_DATE = dateArg || shanghaiDateString(new Date());
const OUTPUT_ROOT = path.resolve(outputArg || path.join("exports", `${USER_NAME}_${SHANGHAI_DATE}_生成图片`));
const RAW_ROOT = path.join(os.tmpdir(), `csgh-export-${safeName(USER_NAME)}-${SHANGHAI_DATE}-${process.pid}`);
const PRODUCT_IMAGE_NAME_ONLY = ["1", "true", "yes"].includes(
  String(process.env.PRODUCT_IMAGE_NAME_ONLY || "").toLowerCase()
);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ASSET_KIND_LABEL = {
  avatar: "头像",
  storefront: "店招",
  poster: "海报",
  product: "产品图",
  p_signboard: "P店招",
  picture_wall: "图片墙",
  detail_page: "详情页",
  brand_story: "品牌故事",
  data_analysis: "数据分析",
  patrol_script: "巡店话术",
};

const PLATFORM_LABEL = { meituan: "美团", taobao: "淘宝闪购" };
const PLATFORM_EXPORT_SPECS = {
  meituan: {
    avatar: { w: 800, h: 800, ext: "png" },
    storefront: { w: 692, h: 390, ext: "png" },
    poster: { w: 720, h: 240, ext: "png" },
    product: { w: 600, h: 450, ext: "jpg", maxBytes: 500 * 1024 },
  },
  taobao: {
    avatar: { w: 800, h: 800, ext: "png" },
    storefront: { w: 750, h: 423, ext: "png" },
    poster: { w: 2048, h: 600, ext: "png" },
    product: { w: 600, h: 600, ext: "jpg" },
  },
};
const FIXED_EXPORT_SPECS = {
  picture_wall: { w: 240, h: 330, ext: "png" },
  p_signboard: { w: 1792, h: 1024, ext: "png" },
  detail_page: { w: 1024, h: 1536, ext: "png" },
  data_analysis: { w: 1536, h: 1024, ext: "png" },
  patrol_script: { w: 1024, h: 1536, ext: "png" },
};
const BRAND_STORY_EXPORT_SPECS = [
  { w: 1536, h: 1024, ext: "jpg", maxBytes: 2 * 1024 * 1024, label: "主文案配图" },
  { w: 1536, h: 864, ext: "jpg", maxBytes: 2 * 1024 * 1024, label: "品牌特色配图" },
  { w: 1536, h: 1152, ext: "jpg", maxBytes: 2 * 1024 * 1024, label: "细节1配图" },
  { w: 1536, h: 1152, ext: "jpg", maxBytes: 2 * 1024 * 1024, label: "细节2配图" },
  { w: 1536, h: 1152, ext: "jpg", maxBytes: 2 * 1024 * 1024, label: "细节3配图" },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("缺少 VITE_SUPABASE_URL/SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量");
  }
}

function shanghaiDateString(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shanghaiDateRangeUtc(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) throw new Error(`日期格式无效：${dateString}，应为 YYYY-MM-DD`);
  const [, y, m, d] = match.map(Number);
  const startMs = Date.UTC(y, m - 1, d, -8, 0, 0, 0);
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function safeName(value, fallback = "未命名") {
  const cleaned = String(value || "")
    .replace(INVALID_CHARS, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 90).replace(/[. ]+$/g, "") || fallback : fallback;
}

function getExtFromUrl(url) {
  try {
    const ext = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
    return ext && ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  } catch {
    return "jpg";
  }
}

function timestampForFile(iso) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.hour}${values.minute}${values.second}`;
}













async function runWithConcurrency(items, limit, worker) {
  let next = 0;
  let done = 0;
  const errors = [];
  async function loop() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await worker(items[index], index);
      } catch (error) {
        errors.push({ item: items[index], error: error instanceof Error ? error.message : String(error) });
      } finally {
        done++;
        if (done % 10 === 0 || done === items.length) {
          process.stdout.write(`\r处理进度 ${done}/${items.length}，失败 ${errors.length}   `);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, loop));
  process.stdout.write("\n");
  return errors;
}













const { buildQueryUrl, supabaseGet, findProfiles, fetchLogs } = createDataTasks({ SUPABASE_URL, SERVICE_ROLE_KEY, USER_NAME });
const { downloadFile, runPythonResize, planOutput, resolveExportSpec, resolveBrandStorySpec, resolveNonProductName, writeManifest } = createOutputTasks({ fs, path, pipeline, spawnSync, OUTPUT_ROOT, safeName, ASSET_KIND_LABEL, PLATFORM_LABEL, timestampForFile, PRODUCT_IMAGE_NAME_ONLY, RAW_ROOT, getExtFromUrl, PLATFORM_EXPORT_SPECS, FIXED_EXPORT_SPECS, BRAND_STORY_EXPORT_SPECS, USER_NAME, SHANGHAI_DATE });
main({ requireEnv, shanghaiDateRangeUtc, SHANGHAI_DATE, USER_NAME, OUTPUT_ROOT, findProfiles, fetchLogs, fs, writeManifest, planOutput, runWithConcurrency, downloadFile, runPythonResize, RAW_ROOT }).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
