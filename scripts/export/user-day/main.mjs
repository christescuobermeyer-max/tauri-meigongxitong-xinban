export async function main(context) {
  const { requireEnv, shanghaiDateRangeUtc, SHANGHAI_DATE, USER_NAME, OUTPUT_ROOT, findProfiles, fetchLogs, fs, writeManifest, planOutput, runWithConcurrency, downloadFile, runPythonResize, RAW_ROOT } = context;

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
