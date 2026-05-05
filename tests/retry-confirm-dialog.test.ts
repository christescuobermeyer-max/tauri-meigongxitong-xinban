import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(
  new URL("../src/components/RetryConfirmDialog.tsx", import.meta.url),
  "utf8"
);
const tileSource = readFileSync(
  new URL("../src/components/GenerationResultTile.tsx", import.meta.url),
  "utf8"
);
const pictureWallSource = readFileSync(
  new URL("../src/components/PictureWallResults.tsx", import.meta.url),
  "utf8"
);

equal(dialogSource.includes("确认重新生成"), true);
equal(dialogSource.includes("取消"), true);
equal(dialogSource.includes("重新生成会再次调用生图接口"), true);
equal(dialogSource.includes("role=\"dialog\""), true);

equal(tileSource.includes("RetryConfirmDialog"), true);
equal(tileSource.includes("setRetryConfirmOpen(true)"), true);
equal(tileSource.includes("handleConfirmRetry"), true);
equal(tileSource.includes("重新生成「${title}」"), true);

equal(pictureWallSource.includes("RetryConfirmDialog"), true);
equal(pictureWallSource.includes("setRetryConfirmOpen(true)"), true);
equal(pictureWallSource.includes("handleConfirmRetry"), true);
equal(pictureWallSource.includes("重新生成图片墙第 ${index + 1} 张"), true);
