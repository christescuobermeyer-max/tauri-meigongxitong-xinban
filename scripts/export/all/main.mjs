export async function main(context) {
  const { ensureDir, ROOT_OUTPUT, SHOP_ROOT, ALL_IMAGES_DIR, SHOP_DATE_ROOT, ALL_IMAGES_DATE_DIR, EXPORT_DATE_FOLDER, fetchAllLogs, ASSET_KIND_LABEL, CATEGORY_FOR_KIND, PLATFORM_LABEL, LINE_LABEL, safeName, getExtFromUrl, path, runWithConcurrency, fs, downloadFile, writeWorkbook, ExcelJS, EXCEL_PATH } = context;

  ensureDir(ROOT_OUTPUT);
  ensureDir(SHOP_ROOT);
  ensureDir(ALL_IMAGES_DIR);
  ensureDir(SHOP_DATE_ROOT);
  ensureDir(ALL_IMAGES_DATE_DIR);
  console.log(`导出根目录: ${ROOT_OUTPUT}`);
  console.log(`本次图片日期目录: ${EXPORT_DATE_FOLDER}\n`);

  console.log("[1/4] 从 Supabase 拉取 generation_logs…");
  const rows = await fetchAllLogs();
  console.log(`  共 ${rows.length} 条记录\n`);

  console.log("[2/4] 规划文件命名与目标路径…");
  const usedAllNames = new Set();
  const usedShopFileNames = new Map();

  const records = rows.map((row, idx) => {
    const kindLabel = ASSET_KIND_LABEL[row.asset_kind] || row.asset_kind;
    const category = CATEGORY_FOR_KIND[row.asset_kind] || "其他";
    const platformLabel = PLATFORM_LABEL[row.platform] || row.platform;
    const lineLabel = LINE_LABEL[row.generation_line] || row.generation_line || "";
    const shop = safeName(row.shop_name);
    const ext = getExtFromUrl(row.oss_url);
    const seq = String(idx + 1).padStart(4, "0");
    const baseName = `${seq}-${kindLabel}.${ext}`;

    const shopDir = path.join(SHOP_DATE_ROOT, shop, category);
    let shopFile = path.join(shopDir, baseName);
    const shopKey = shopFile.toLowerCase();
    if (usedShopFileNames.has(shopKey)) {
      shopFile = path.join(shopDir, `${seq}-${kindLabel}-${idx}.${ext}`);
    }
    usedShopFileNames.set(shopFile.toLowerCase(), true);

    let allName = `${seq}-${shop}-${kindLabel}.${ext}`;
    if (usedAllNames.has(allName.toLowerCase())) {
      allName = `${seq}-${shop}-${kindLabel}-${idx}.${ext}`;
    }
    usedAllNames.add(allName.toLowerCase());
    const allFile = path.join(ALL_IMAGES_DATE_DIR, allName);

    return {
      ...row,
      kindLabel,
      category,
      platformLabel,
      lineLabel,
      shopSafe: shop,
      shopFile,
      allFile,
      relShopFile: path.relative(ROOT_OUTPUT, shopFile),
      relAllFile: path.relative(ROOT_OUTPUT, allFile),
    };
  });
  console.log(`  目标路径就绪 (${records.length} 项)\n`);

  console.log("[3/4] 下载图片到本地（并发 12）…");
  const errors = await runWithConcurrency(records, 12, async (rec) => {
    if (!fs.existsSync(rec.shopFile)) {
      await downloadFile(rec.oss_url, rec.shopFile);
    }
    if (!fs.existsSync(rec.allFile)) {
      await fs.promises.mkdir(path.dirname(rec.allFile), { recursive: true });
      await fs.promises.copyFile(rec.shopFile, rec.allFile);
    }
  });
  console.log(`  下载完成，失败 ${errors.length} 条\n`);

  console.log("[4/4] 生成 Excel…");
  await writeWorkbook({ ExcelJS, records, errors, EXCEL_PATH });
  console.log(`  Excel 已生成: ${EXCEL_PATH}\n`);

  console.log("完成 ✓");
  console.log(`  店铺目录:    ${SHOP_ROOT}`);
  console.log(`  全部图片:    ${ALL_IMAGES_DIR}`);
  console.log(`  本次日期目录: ${EXPORT_DATE_FOLDER}`);
  console.log(`  汇总表格:    ${EXCEL_PATH}`);

}
