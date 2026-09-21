import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_THREE_PIECE_SELECTION,
  SKIPPED_THREE_PIECE_MESSAGE,
  canBatchDownloadThreePieceSelection,
  formatThreePieceSelection,
  getSelectedThreePieceKinds,
  toggleThreePieceSelection,
} from "../src/lib/three-piece-selection.js";
import { getSelectedAvatarStorefrontPosterSequence } from "../src/lib/generation-sequence.js";
import type { GenerationItem } from "../src/types";

deepEqual(getSelectedThreePieceKinds(DEFAULT_THREE_PIECE_SELECTION), [
  "avatar",
  "storefront",
  "poster",
]);
equal(formatThreePieceSelection(DEFAULT_THREE_PIECE_SELECTION), "头像、店招与海报");

const onlyAvatar = { avatar: true, storefront: false, poster: false };
deepEqual(getSelectedAvatarStorefrontPosterSequence(onlyAvatar), ["avatar"]);
equal(formatThreePieceSelection(onlyAvatar), "头像");
equal(formatThreePieceSelection({ avatar: true, storefront: true, poster: false }), "头像、店招");

const unchanged = toggleThreePieceSelection(onlyAvatar, "avatar");
equal(unchanged, onlyAvatar, "三件套选择不能取消到 0 项");
deepEqual(toggleThreePieceSelection(onlyAvatar, "poster"), {
  avatar: true,
  storefront: false,
  poster: true,
});

function item(kind: "avatar" | "storefront" | "poster", status: GenerationItem["status"], rawBase64?: string): GenerationItem {
  return {
    kind,
    status,
    rawBase64: rawBase64 ?? null,
    rawDataUrl: rawBase64 ? `data:image/png;base64,${rawBase64}` : null,
  };
}

equal(
  canBatchDownloadThreePieceSelection(
    {
      avatar: item("avatar", "succeeded", "a"),
      storefront: item("storefront", "idle"),
      poster: item("poster", "idle"),
    },
    onlyAvatar
  ),
  true,
  "只选头像时只要求头像成功即可批量下载"
);

equal(
  canBatchDownloadThreePieceSelection(
    {
      avatar: item("avatar", "succeeded", "a"),
      storefront: item("storefront", "failed"),
      poster: item("poster", "succeeded", "p"),
    },
    DEFAULT_THREE_PIECE_SELECTION
  ),
  false,
  "全选时任一选中项失败不能批量下载"
);

equal(SKIPPED_THREE_PIECE_MESSAGE, "本次未选择生成");

const generatePanel = readFileSync(new URL("../src/components/GeneratePanel.tsx", import.meta.url), "utf8");
const resultPanel = readFileSync(new URL("../src/components/ResultPanel.tsx", import.meta.url), "utf8");
const workspacePage = readFileSync(
  new URL("../src/components/workspace/ThreePieceWorkspacePage.tsx", import.meta.url),
  "utf8"
);
const workspaceHook = readFileSync(new URL("../src/hooks/useThreePieceWorkspace.ts", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

ok(generatePanel.includes('className="three-piece-selection"'), "输入区应渲染三件套多选控件");
ok(generatePanel.includes("THREE_PIECE_ORDER.map"), "多选项应由统一顺序配置驱动");
ok(generatePanel.includes("selectedAssetKinds.length > 0"), "提交前应确保至少选择 1 项");
ok(resultPanel.includes("SKIPPED_THREE_PIECE_MESSAGE"), "未选项应显示本次未选择生成");
ok(resultPanel.includes("actionsDisabled={!selectedKinds.avatar}"), "未选头像应禁用结果卡动作");
ok(resultPanel.includes("formatThreePieceSelection(selectedKinds)"), "结果区批量下载提示应按选择动态展示");
ok(workspacePage.includes("onToggleSelectedKind={tp.toggleSelectedKind}"), "页面应透传选择切换函数");
ok(workspaceHook.includes("queueGenerationItems(selectedAssetKinds, setters)"), "生成前应只排队选中项");
ok(workspaceHook.includes("clearUnselectedItems(snapshot.selectedAssetKinds)"), "生成时应清空未选项旧结果");
ok(workspaceHook.includes("canBatchDownloadThreePieceSelection(currentItems, selectedKinds)"), "批量下载可用性应按选中项判断");
ok(workspaceHook.includes("saveGeneratedAssetsBatch("), "批量下载应走统一保存入口");
ok(globalCss.includes(".three-piece-selection"), "三件套选择控件应有样式覆盖");

console.log("three piece selection contract: OK");
