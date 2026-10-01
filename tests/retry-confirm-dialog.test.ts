import { equal, ok } from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const tile = readFileSync(new URL("../src/components/GenerationResultTile.tsx", import.meta.url), "utf8");
const wall = readFileSync(new URL("../src/components/PictureWallResults.tsx", import.meta.url), "utf8");
equal(existsSync(new URL("../src/components/RetryConfirmDialog.tsx", import.meta.url)), false);
ok(tile.includes("onClick={onRetry}"), "结果卡片保留显式重试命令");
ok(tile.includes("disabled={busy || actionsDisabled}"), "忙碌或未选择结果时不能重复提交");
ok(tile.includes("downloadOptions") && tile.includes("result-download-menu"), "保留独立下载选项");
ok(wall.includes("onRetry(entry.sourceImageId)"), "图片墙重试只提交选中原图");
ok(!tile.includes("setRetryConfirmOpen"), "不恢复已移除的确认弹窗状态");
