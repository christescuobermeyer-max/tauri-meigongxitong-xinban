/**
 * 阿里云账单 - GA(CDT) 账单详情抓取
 *
 * 复用 daily-data-crawler 的 aliyun-auth.json 登录态。
 * 进入 BillingCycle=2026-05 PipCode=cdt 的明细页，提取页面文本和截图。
 */

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const CONFIG = {
  url:
    "https://billing-cost.console.aliyun.com/finance/expense-report/expense-detail-by-instance" +
    "?BillingCycle=2026-05&PipCode%5BfilterMode%5D=IN&PipCode%5Bvalues%5D=cdt",
  storageFile:
    "F:/tuosir90-claude-code/meiritongjiAPIshuju/aliyun-oss-crawler/aliyun-auth.json",
  outDir: path.resolve(__dirname, "..", "tmp", "ga-bill"),
  // 浏览器有头模式：方便万一登录态过期时人工补登
  headless: false,
  timeout: 180_000,
};

function ensureOutDir() {
  fs.mkdirSync(CONFIG.outDir, { recursive: true });
}

async function dumpPage(page, label) {
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const png = path.join(CONFIG.outDir, `${label}-${ts}.png`);
  const html = path.join(CONFIG.outDir, `${label}-${ts}.html`);
  const txt = path.join(CONFIG.outDir, `${label}-${ts}.txt`);
  await page.screenshot({ path: png, fullPage: true });
  const content = await page.content();
  fs.writeFileSync(html, content);
  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(txt, text);
  console.log(`[dump] screenshot=${png}`);
  console.log(`[dump] html      =${html}`);
  console.log(`[dump] text      =${txt}`);
  return { png, html, txt };
}

async function main() {
  ensureOutDir();

  if (!fs.existsSync(CONFIG.storageFile)) {
    throw new Error(
      `登录态文件不存在：${CONFIG.storageFile}\n` +
        "请先用 daily-data-crawler 跑一次阿里云 OSS 抓取以生成 aliyun-auth.json"
    );
  }

  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext({
    storageState: CONFIG.storageFile,
    viewport: { width: 1600, height: 1000 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(CONFIG.timeout);

  console.log("[step] 打开账单详情页…");
  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });

  // 等待 SPA 渲染。优先等待表格/数字渲染出"金额"列
  console.log("[step] 等待表格渲染…");
  try {
    await page.waitForLoadState("networkidle", { timeout: 60_000 });
  } catch (e) {
    console.log("[warn] networkidle 超时，继续");
  }

  // 一些金额可能含 "¥" 字符；用它做就绪信号
  try {
    await page.waitForFunction(
      () => /¥/.test(document.body.innerText),
      { timeout: 60_000 }
    );
    console.log("[step] ¥ 已出现，认为表格已渲染");
  } catch (e) {
    console.log("[warn] 等待 ¥ 超时，可能登录态失效。给 90s 让你手动登录…");
    await dumpPage(page, "before-login");
    // 给人足够时间手动登录
    await page.waitForFunction(
      () => /¥/.test(document.body.innerText),
      { timeout: 240_000 }
    );
    // 顺手把新的登录态写回，下次免登
    await context.storageState({ path: CONFIG.storageFile });
    console.log(`[step] 已更新 ${CONFIG.storageFile}`);
  }

  // 给表格再多 5s 渲染分页/汇总
  await page.waitForTimeout(5000);

  console.log("[step] 抓取页面内容…");
  const { txt } = await dumpPage(page, "ga-bill");

  // 也提取所有 ¥ 数字行作为快速汇总
  const lines = fs.readFileSync(txt, "utf8").split(/\r?\n/);
  const moneyLines = lines.filter((line) => /¥/.test(line));
  fs.writeFileSync(
    path.join(CONFIG.outDir, "ga-bill-money-lines.txt"),
    moneyLines.join("\n")
  );
  console.log(`[step] 提取到含 ¥ 的行 ${moneyLines.length} 条`);
  console.log("--- ¥ 行预览（前 30 条） ---");
  moneyLines.slice(0, 30).forEach((l) => console.log(l));

  await browser.close();
  console.log("[done]");
}

main().catch((err) => {
  console.error("[error]", err);
  process.exit(1);
});
