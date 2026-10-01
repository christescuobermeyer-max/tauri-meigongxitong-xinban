export async function main(context) {
  const { ensureDir, ROOT_OUTPUT, SHOP_ROOT, ALL_IMAGES_DIR, SHOP_DATE_ROOT, ALL_IMAGES_DATE_DIR, EXPORT_DATE_FOLDER, readExistingExcel, fetchAllLogs, path, planNewRecord, runWithConcurrency, fs, downloadFile, writeWorkbook, ExcelJS, EXCEL_PATH } = context;

  ensureDir(ROOT_OUTPUT);
  ensureDir(SHOP_ROOT);
  ensureDir(ALL_IMAGES_DIR);
  ensureDir(SHOP_DATE_ROOT);
  ensureDir(ALL_IMAGES_DATE_DIR);
  console.log(`导出根目录: ${ROOT_OUTPUT}`);
  console.log(`本次新增图片日期目录: ${EXPORT_DATE_FOLDER}\n`);

  console.log("[1/5] 读取既有 Excel 已导出记录…");
  const { map: existingByUrl, maxSeq } = await readExistingExcel();
  console.log(`  已记录 ${existingByUrl.size} 条，maxSeq=${maxSeq}\n`);

  console.log("[2/5] 从 Supabase 拉取全部 generation_logs…");
  const rows = await fetchAllLogs();
  console.log(`  云端共 ${rows.length} 条记录\n`);

  console.log("[3/5] 计算新增记录…");
  const newRowsRaw = rows.filter((r) => r.oss_url && !existingByUrl.has(r.oss_url));
  // 已经按 created_at DESC 排序（来自 fetchAllLogs），保持批次内 DESC 编号
  newRowsRaw.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  console.log(`  新增 ${newRowsRaw.length} 条（将从 seq ${maxSeq + 1} 开始）\n`);

  const usedAllNames = new Set();
  const usedShopFileNames = new Map();
  // 把既有占用也登记进去，避免新文件名碰撞
  for (const rec of existingByUrl.values()) {
    if (rec.relShopFile) usedShopFileNames.set(path.join(ROOT_OUTPUT, rec.relShopFile).toLowerCase(), true);
    if (rec.relAllFile) usedAllNames.add(path.basename(rec.relAllFile).toLowerCase());
  }

  const newRecords = newRowsRaw.map((row, i) =>
    planNewRecord(row, maxSeq + 1 + i, usedAllNames, usedShopFileNames),
  );

  console.log(`[4/5] 下载新图片（并发 12）…`);
  const errors = await runWithConcurrency(newRecords, 12, async (rec) => {
    if (!fs.existsSync(rec.shopFile)) {
      await downloadFile(rec.oss_url, rec.shopFile);
    }
    if (!fs.existsSync(rec.allFile)) {
      await fs.promises.mkdir(path.dirname(rec.allFile), { recursive: true });
      await fs.promises.copyFile(rec.shopFile, rec.allFile);
    }
  });
  console.log(`  下载完成，失败 ${errors.length} 条\n`);

  console.log("[5/5] 重建 Excel（旧+新合并）…");
  // 合并：旧记录直接复用；新记录按 seq 添加。最终按 seq ASC 排序。
  const allMerged = [];
  for (const rec of existingByUrl.values()) {
    allMerged.push({
      seq: rec.seq,
      shop_name: rec.shop_name,
      category: rec.category,
      kindLabel: rec.kindLabel,
      platformLabel: rec.platformLabel,
      lineLabel: rec.lineLabel,
      createdAt: rec.createdAt,
      oss_url: rec.oss_url,
      relShopFile: rec.relShopFile,
      relAllFile: rec.relAllFile,
      oss_key: rec.oss_key,
    });
  }
  for (const rec of newRecords) {
    allMerged.push({
      seq: rec.seq,
      shop_name: rec.shop_name,
      category: rec.category,
      kindLabel: rec.kindLabel,
      platformLabel: rec.platformLabel,
      lineLabel: rec.lineLabel,
      createdAt: rec.createdAt,
      oss_url: rec.oss_url,
      relShopFile: rec.relShopFile,
      relAllFile: rec.relAllFile,
      oss_key: rec.oss_key,
    });
  }
  allMerged.sort((a, b) => a.seq - b.seq);

  await writeWorkbook({ ExcelJS, allMerged, newRecords, errors, EXCEL_PATH });
  console.log(`  Excel 已生成: ${EXCEL_PATH}\n`);

  console.log("完成 ✓");
  console.log(`  本次新增:    ${newRecords.length} 条（seq ${maxSeq + 1} ~ ${maxSeq + newRecords.length}）`);
  console.log(`  下载失败:    ${errors.length} 条`);
  console.log(`  店铺目录:    ${SHOP_ROOT}`);
  console.log(`  全部图片:    ${ALL_IMAGES_DIR}`);
  console.log(`  本次日期目录: ${EXPORT_DATE_FOLDER}`);
  console.log(`  汇总表格:    ${EXCEL_PATH}`);

}
