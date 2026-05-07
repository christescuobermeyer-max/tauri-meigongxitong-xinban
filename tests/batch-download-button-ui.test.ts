import { equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const buttonUrl = new URL("../src/components/BatchDownloadButton.tsx", import.meta.url);
ok(existsSync(buttonUrl), "应提供统一的批量下载按钮组件");

const buttonSource = readFileSync(buttonUrl, "utf8");
const detailPageSource = readFileSync(
  new URL("../src/components/DetailPageResults.tsx", import.meta.url),
  "utf8"
);
const resultPanelSource = readFileSync(
  new URL("../src/components/ResultPanel.tsx", import.meta.url),
  "utf8"
);
const pictureWallSource = readFileSync(
  new URL("../src/components/PictureWallResults.tsx", import.meta.url),
  "utf8"
);
const productBatchSource = readFileSync(
  new URL("../src/components/ProductBatchResultPanel.tsx", import.meta.url),
  "utf8"
);
const globalCssSource = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

equal(buttonSource.includes("batch-download-button"), true);
equal(buttonSource.includes("batch-download-button__icon"), true);
equal(buttonSource.includes("batch-download-button__meta"), true);
equal(buttonSource.includes("IconDownload"), true);

equal(detailPageSource.includes("BatchDownloadButton"), true);
equal(detailPageSource.includes('label="批量下载详情页"'), true);
equal(detailPageSource.includes('meta={`已完成 ${completedCount}/3`}'), true);

equal(resultPanelSource.includes("BatchDownloadButton"), true);
equal(resultPanelSource.includes('label="批量下载美团尺寸"'), true);
equal(resultPanelSource.includes('label="批量下载淘宝闪购尺寸"'), true);
equal(resultPanelSource.includes('meta="头像 / 店招 / 海报"'), true);

equal(pictureWallSource.includes("BatchDownloadButton"), true);
equal(pictureWallSource.includes('label={downloadStatus?.active ? "下载中…" : "批量下载图片墙"}'), true);
equal(pictureWallSource.includes('meta={`已完成 ${completedCount}/${entries.length || 3}`}'), true);

equal(productBatchSource.includes("BatchDownloadButton"), true);
equal(productBatchSource.includes('label="批量下载全店图"'), true);
equal(productBatchSource.includes("downloadTotal"), true);

equal(globalCssSource.includes(".batch-download-button"), true);
equal(globalCssSource.includes(".batch-download-button__icon"), true);
