export function createOutputTasks(context) {
  const { fs, path, pipeline, spawnSync, OUTPUT_ROOT, safeName, ASSET_KIND_LABEL, PLATFORM_LABEL, timestampForFile, PRODUCT_IMAGE_NAME_ONLY, RAW_ROOT, getExtFromUrl, PLATFORM_EXPORT_SPECS, FIXED_EXPORT_SPECS, BRAND_STORY_EXPORT_SPECS, USER_NAME, SHANGHAI_DATE } = context;
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
  return { downloadFile, runPythonResize, planOutput, resolveExportSpec, resolveBrandStorySpec, resolveNonProductName, writeManifest };
}
