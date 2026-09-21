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

function buildQueryUrl(table, params) {
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) url.searchParams.append(key, item);
  }
  return url;
}

async function supabaseGet(table, params) {
  const response = await fetch(buildQueryUrl(table, params), {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase 读取 ${table} 失败：HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function findProfiles() {
  const exact = await supabaseGet("profiles", {
    select: "id,display_name",
    display_name: `eq.${USER_NAME}`,
  });
  if (exact.length) return exact;
  return supabaseGet("profiles", {
    select: "id,display_name",
    display_name: `ilike.*${USER_NAME}*`,
  });
}

async function fetchLogs(userIds, startIso, endIso) {
  const all = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const rows = await supabaseGet("generation_logs", {
      select: "id,user_id,shop_name,product_name,asset_kind,platform,generation_line,oss_url,oss_key,created_at",
      user_id: `in.(${userIds.join(",")})`,
      created_at: [`gte.${startIso}`, `lt.${endIso}`],
      order: "created_at.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function downloadFile(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await pipeline(response.body, fs.createWriteStream(targetPath));
}

function runPythonResize(inputPath, outputPath, width, height, maxBytes) {
  const script = String.raw`
import sys
from pathlib import Path
from PIL import Image

src, dst, width, height, max_bytes = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
Path(dst).parent.mkdir(parents=True, exist_ok=True)
ext = Path(dst).suffix.lower()
if ext in [".jpg", ".jpeg"]:
    img = Image.open(src).convert("RGB")
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    quality = 92
    while True:
        img.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)
        if max_bytes <= 0 or Path(dst).stat().st_size <= max_bytes or quality <= 60:
            break
        quality -= 4
else:
    img = Image.open(src).convert("RGBA")
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    img.save(dst, "PNG", optimize=True)
`;
  const result = spawnSync("python", ["-c", script, inputPath, outputPath, String(width), String(height), String(maxBytes || 0)], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`产品图尺寸转换失败：${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
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

function planOutput(row, index) {
  const shopDir = path.join(OUTPUT_ROOT, safeName(row.shop_name));
  const kindLabel = ASSET_KIND_LABEL[row.asset_kind] || row.asset_kind || "图片";
  const platformLabel = PLATFORM_LABEL[row.platform] || row.platform || "未知平台";
  const time = timestampForFile(row.created_at);
  const seq = String(index + 1).padStart(3, "0");
  const spec = resolveExportSpec(row);
  const nameLabel = row.asset_kind === "product"
    ? safeName(row.product_name || row.shop_name)
    : resolveNonProductName(row, kindLabel);
  const fileName = row.asset_kind === "product" && PRODUCT_IMAGE_NAME_ONLY
    ? `${nameLabel}.${spec.ext}`
    : `${seq}_${time}_${nameLabel}_${platformLabel}_${spec.w}x${spec.h}.${spec.ext}`;

  return {
    rawPath: path.join(RAW_ROOT, `${row.id}.${getExtFromUrl(row.oss_url)}`),
    finalPath: path.join(shopDir, fileName),
    resize: spec,
  };
}

function resolveExportSpec(row) {
  if (row.asset_kind === "brand_story") {
    return resolveBrandStorySpec(row.oss_url);
  }
  const platformSpec = PLATFORM_EXPORT_SPECS[row.platform]?.[row.asset_kind];
  const fixedSpec = FIXED_EXPORT_SPECS[row.asset_kind];
  const spec = platformSpec || fixedSpec;
  if (!spec) throw new Error(`未知导出尺寸：${row.asset_kind}/${row.platform}`);
  return spec;
}

function resolveBrandStorySpec(url) {
  const index = Number.parseInt(String(url || "").match(/brand-story-(\d+)/i)?.[1] || "1", 10);
  return BRAND_STORY_EXPORT_SPECS[index - 1] || BRAND_STORY_EXPORT_SPECS[0];
}

function resolveNonProductName(row, kindLabel) {
  if (row.asset_kind === "brand_story") {
    return `${kindLabel}_${resolveBrandStorySpec(row.oss_url).label}`;
  }
  return kindLabel;
}

async function writeManifest(records, errors, profiles, range) {
  const manifest = {
    exportedAt: new Date().toISOString(),
    userName: USER_NAME,
    matchedProfiles: profiles,
    shanghaiDate: SHANGHAI_DATE,
    utcRange: range,
    outputRoot: OUTPUT_ROOT,
    total: records.length,
  productCount: records.filter((row) => row.asset_kind === "product").length,
  shopCount: new Set(records.map((row) => row.shop_name)).size,
    assetKindCounts: records.reduce((acc, row) => {
      acc[row.asset_kind] = (acc[row.asset_kind] || 0) + 1;
      return acc;
    }, {}),
    errors: errors.map(({ item, error }) => ({ id: item.id, shop_name: item.shop_name, product_name: item.product_name, asset_kind: item.asset_kind, error })),
    records: records.map((row) => ({
      id: row.id,
      shop_name: row.shop_name,
      product_name: row.product_name,
      asset_kind: row.asset_kind,
      platform: row.platform,
      generation_line: row.generation_line,
      created_at: row.created_at,
      oss_key: row.oss_key,
      saved_path: row.finalPath,
    })),
  };
  await fs.promises.writeFile(path.join(OUTPUT_ROOT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

async function main() {
  requireEnv();
  const range = shanghaiDateRangeUtc(SHANGHAI_DATE);
  console.log(`导出用户：${USER_NAME}`);
  console.log(`上海日期：${SHANGHAI_DATE} (${range.startIso} ~ ${range.endIso})`);
  console.log(`输出目录：${OUTPUT_ROOT}`);

  const profiles = await findProfiles();
  if (!profiles.length) throw new Error(`未找到用户：${USER_NAME}`);
  console.log(`匹配账号：${profiles.map((profile) => profile.display_name).join("、")}`);

  const records = await fetchLogs(profiles.map((profile) => profile.id), range.startIso, range.endIso);
  if (!records.length) {
    await fs.promises.mkdir(OUTPUT_ROOT, { recursive: true });
    await writeManifest([], [], profiles, range);
    console.log("今天没有找到生成图片记录。");
    return;
  }

  const planned = records.map((row, index) => ({ ...row, ...planOutput(row, index) }));
  const errors = await runWithConcurrency(planned, 6, async (row) => {
    await downloadFile(row.oss_url, row.rawPath);
    try {
      runPythonResize(row.rawPath, row.finalPath, row.resize.w, row.resize.h, row.resize.maxBytes);
    } finally {
      await fs.promises.rm(row.rawPath, { force: true }).catch(() => undefined);
    }
  });
  await fs.promises.rm(RAW_ROOT, { recursive: true, force: true }).catch(() => undefined);

  await writeManifest(planned, errors, profiles, range);

  const shops = new Set(planned.map((row) => row.shop_name));
  const products = planned.filter((row) => row.asset_kind === "product");
  console.log(`完成：${planned.length - errors.length}/${planned.length} 张，店铺 ${shops.size} 个，产品图 ${products.length} 张。`);
  if (errors.length) {
    console.log(`失败 ${errors.length} 张，详情见 manifest.json`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
