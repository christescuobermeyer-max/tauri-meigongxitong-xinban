import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebarSource = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
equal(sidebarSource.includes('label: "图片墙生成"'), true);

const workspaceHookSource = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8"
);
equal(workspaceHookSource.includes('"pictureWall"'), true);
equal(workspaceHookSource.includes("usePictureWallWorkspace"), true);
equal(workspaceHookSource.includes("onRecordPictureWallHistory"), true);
equal(workspaceHookSource.includes('pushHistoryEntry("picture_wall", item)'), true);
equal(workspaceHookSource.includes("retryPictureWallItem"), true);
equal(workspaceHookSource.includes("resetPictureWall"), false);

const pictureWallHookSource = readFileSync(
  new URL("../src/hooks/usePictureWallWorkspace.ts", import.meta.url),
  "utf8"
);
equal(pictureWallHookSource.includes("onRecordPictureWallHistory"), true);
equal(pictureWallHookSource.includes("onRecordPictureWallHistory?.(item)"), true);
equal(pictureWallHookSource.includes("generationLine"), true);
equal(pictureWallHookSource.includes("handleRetry"), true);
equal(pictureWallHookSource.includes("function reset"), false);

const shellSource = readFileSync(new URL("../src/components/WorkspaceShell.tsx", import.meta.url), "utf8");
equal(shellSource.includes('? "图片墙生成"'), true);

const pagesSource = readFileSync(new URL("../src/components/WorkspacePages.tsx", import.meta.url), "utf8");
equal(pagesSource.includes("PictureWallPage"), true);
equal(pagesSource.includes("PictureWallTabsPage"), false);
equal(pagesSource.includes('className="page picture-wall-page"'), true);

const pageSource = readFileSync(new URL("../src/components/PictureWallPage.tsx", import.meta.url), "utf8");
equal(pageSource.includes("ImageUpload"), true);
equal(pageSource.includes("maxCount={3}"), true);
equal(pageSource.includes("生成图片墙"), true);
equal(pageSource.includes("PICTURE_WALL_EXPORT_SIZE"), true);
equal(pageSource.includes("downloadStatus"), true);
equal(pageSource.includes("GenerationLineCard"), true);
equal(pageSource.includes('className="panel-stack"'), true);
equal(pageSource.includes('className="picture-wall-panel"'), false);
equal(pageSource.includes("PictureWallProductNames"), true);
equal(pageSource.includes("showProductName"), true);
equal(pageSource.includes("PromptPreview"), false);
equal(pageSource.includes("buildPictureWallPrompt"), false);
equal(pageSource.includes("IconRefresh"), false);
equal(pageSource.includes("onReset"), false);
equal(pageSource.includes("onDownload"), true);
equal(pageSource.includes("onRetry"), true);

const productNameSource = readFileSync(
  new URL("../src/components/PictureWallProductNames.tsx", import.meta.url),
  "utf8"
);
equal(productNameSource.includes("已识别产品名称"), true);
equal(productNameSource.includes("picture-wall-product-names"), true);

const imageUploadSource = readFileSync(new URL("../src/components/ImageUpload.tsx", import.meta.url), "utf8");
equal(imageUploadSource.includes("showProductName"), true);
equal(imageUploadSource.includes("thumb__product-name"), true);

const resultsSource = readFileSync(new URL("../src/components/PictureWallResults.tsx", import.meta.url), "utf8");
const pictureWallCssSource = readFileSync(new URL("../src/styles/picture-wall.css", import.meta.url), "utf8");
equal(resultsSource.includes("BatchDownloadButton"), true);
equal(resultsSource.includes("批量下载图片墙"), true);
equal(resultsSource.includes("onDownload"), true);
equal(resultsSource.includes("onRetry"), true);
equal(resultsSource.includes("重试"), true);
equal(resultsSource.includes("正在下载图片"), true);
equal(resultsSource.includes("点击重试重新生成"), true);
equal(resultsSource.includes("请重置后重新生成"), false);
equal(resultsSource.includes("picture-wall-tile__meta"), true);
equal(resultsSource.includes("picture-wall-tile__retry"), true);
equal(resultsSource.includes("picture-wall-state__message"), true);
equal(resultsSource.includes("getPictureWallErrorMessage"), true);
equal(pictureWallCssSource.includes("grid-template-columns: max-content minmax(0, 1fr);"), true);
equal(pictureWallCssSource.includes(".picture-wall-tile__index"), true);
equal(pictureWallCssSource.includes("white-space: nowrap;"), true);
equal(pictureWallCssSource.includes(".picture-wall-tile__badge"), true);
