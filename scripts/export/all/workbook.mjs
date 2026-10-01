export async function writeWorkbook(context) {
  const { ExcelJS, records, errors, EXCEL_PATH } = context;
const wb = new ExcelJS.Workbook();
  wb.creator = "csgh-image-studio";
  wb.created = new Date();

  const detail = wb.addWorksheet("全部明细");
  detail.columns = [
    { header: "序号", key: "seq", width: 8 },
    { header: "店铺名称", key: "shop", width: 30 },
    { header: "分类", key: "category", width: 10 },
    { header: "图片类型", key: "kindLabel", width: 10 },
    { header: "平台", key: "platformLabel", width: 8 },
    { header: "线路", key: "lineLabel", width: 18 },
    { header: "生成时间", key: "createdAt", width: 22 },
    { header: "OSS 链接", key: "oss_url", width: 80 },
    { header: "店铺目录内路径", key: "relShopFile", width: 60 },
    { header: "全部图片内路径", key: "relAllFile", width: 50 },
    { header: "OSS Key", key: "oss_key", width: 50 },
  ];
  records.forEach((rec, i) => {
    detail.addRow({
      seq: i + 1,
      shop: rec.shop_name,
      category: rec.category,
      kindLabel: rec.kindLabel,
      platformLabel: rec.platformLabel,
      lineLabel: rec.lineLabel,
      createdAt: rec.created_at,
      oss_url: rec.oss_url,
      relShopFile: rec.relShopFile,
      relAllFile: rec.relAllFile,
      oss_key: rec.oss_key || "",
    });
  });
  detail.getRow(1).font = { bold: true };
  detail.views = [{ state: "frozen", ySplit: 1 }];
  detail.autoFilter = { from: "A1", to: "K1" };

  const byShop = new Map();
  for (const rec of records) {
    const key = rec.shop_name || "(无店铺名)";
    if (!byShop.has(key)) {
      byShop.set(key, {
        shop: key,
        total: 0,
        三件套: 0,
        产品图: 0,
        其他: 0,
        头像: 0,
        店招: 0,
        海报: 0,
        P店招: 0,
        图片墙: 0,
        详情页: 0,
      });
    }
    const row = byShop.get(key);
    row.total += 1;
    row[rec.category] = (row[rec.category] || 0) + 1;
    row[rec.kindLabel] = (row[rec.kindLabel] || 0) + 1;
  }

  const shopSheet = wb.addWorksheet("按店铺统计");
  shopSheet.columns = [
    { header: "店铺名称", key: "shop", width: 32 },
    { header: "图片总数", key: "total", width: 10 },
    { header: "三件套", key: "三件套", width: 10 },
    { header: "产品图", key: "产品图", width: 10 },
    { header: "其他", key: "其他", width: 10 },
    { header: "头像", key: "头像", width: 8 },
    { header: "店招", key: "店招", width: 8 },
    { header: "海报", key: "海报", width: 8 },
    { header: "产品图", key: "产品图_count", width: 10 },
    { header: "P店招", key: "P店招", width: 8 },
    { header: "图片墙", key: "图片墙", width: 8 },
    { header: "详情页", key: "详情页", width: 8 },
  ];
  const shopRows = [...byShop.values()].sort((a, b) => b.total - a.total);
  shopRows.forEach((r) => {
    shopSheet.addRow({
      shop: r.shop,
      total: r.total,
      三件套: r.三件套 || 0,
      产品图: r.产品图 || 0,
      其他: r.其他 || 0,
      头像: r.头像 || 0,
      店招: r.店招 || 0,
      海报: r.海报 || 0,
      产品图_count: r.产品图 || 0,
      P店招: r.P店招 || 0,
      图片墙: r.图片墙 || 0,
      详情页: r.详情页 || 0,
    });
  });
  shopSheet.getRow(1).font = { bold: true };
  shopSheet.views = [{ state: "frozen", ySplit: 1 }];

  const kindSheet = wb.addWorksheet("按类型统计");
  kindSheet.columns = [
    { header: "图片类型", key: "kind", width: 16 },
    { header: "分类", key: "category", width: 12 },
    { header: "数量", key: "count", width: 12 },
  ];
  const byKind = new Map();
  for (const rec of records) {
    const k = rec.kindLabel;
    if (!byKind.has(k)) byKind.set(k, { kind: k, category: rec.category, count: 0 });
    byKind.get(k).count += 1;
  }
  [...byKind.values()].sort((a, b) => b.count - a.count).forEach((r) => kindSheet.addRow(r));
  kindSheet.getRow(1).font = { bold: true };

  const summary = wb.addWorksheet("总览");
  summary.columns = [
    { header: "项目", key: "item", width: 28 },
    { header: "数值", key: "value", width: 30 },
  ];
  summary.addRow({ item: "记录总数", value: records.length });
  summary.addRow({ item: "店铺数量", value: byShop.size });
  summary.addRow({ item: "三件套总数", value: records.filter((r) => r.category === "三件套").length });
  summary.addRow({ item: "产品图总数", value: records.filter((r) => r.category === "产品图").length });
  summary.addRow({ item: "其他类型总数", value: records.filter((r) => r.category === "其他").length });
  summary.addRow({ item: "下载失败数量", value: errors.length });
  summary.addRow({ item: "导出生成时间", value: new Date().toISOString() });
  summary.getRow(1).font = { bold: true };

  if (errors.length > 0) {
    const errSheet = wb.addWorksheet("下载失败");
    errSheet.columns = [
      { header: "记录索引", key: "index", width: 10 },
      { header: "错误信息", key: "error", width: 60 },
      { header: "店铺", key: "shop", width: 24 },
      { header: "类型", key: "kindLabel", width: 12 },
      { header: "OSS 链接", key: "oss_url", width: 80 },
    ];
    errors.forEach((e) => {
      const rec = records[e.index];
      errSheet.addRow({
        index: e.index,
        error: e.error,
        shop: rec?.shop_name || "",
        kindLabel: rec?.kindLabel || "",
        oss_url: rec?.oss_url || "",
      });
    });
    errSheet.getRow(1).font = { bold: true };
  }

  await wb.xlsx.writeFile(EXCEL_PATH);
}
