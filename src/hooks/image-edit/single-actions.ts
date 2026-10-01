import { buildImageEditPrompt, getImageEditSourceMaxCount, IMAGE_EDIT_LABEL, resolveImageEditReferences, resolveImageEditSourceReferences, type ImageEditKind } from "../../lib/image-edit";
import { buildImageEditPromptConfig } from "../../lib/prompt-config";
import { ensureUploadedImagesOnOss } from "../../lib/oss-assets";
import { generateAsset } from "../../lib/workspace-generation";
import { getAutoRetryAttempt, runWithAutoRetry } from "../../lib/generation-retry";
import { emptyItem } from "../../lib/workspace-session";
import type { GenerationItem } from "../../types";
import type { Options } from "./types";
import type { useImageEditState } from "./useImageEditState";
import { resolveImageEditProductName } from "./utils";
type Context = ReturnType<typeof useImageEditState> & Options;

export function createImageEditSingleAction(context: Context) {
  const { generationLine, onToast, onRecordHistory, shopName, platform, currentPlatform, busy, entries, patchEntry } = context;
  async function generateSingle(kind: ImageEditKind) {
    const entry = entries[kind];
    if (busy) return;
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    if (entry.images.length === 0) {
      onToast(`请先上传${kind === "product" ? "产品图" : "图片"}`, "error");
      return;
    }
    if (entry.images.length > getImageEditSourceMaxCount(kind, "single")) {
      onToast(`单张修改最多支持 ${getImageEditSourceMaxCount(kind, "single")} 张原图`, "error");
      return;
    }
    if (!entry.instruction.trim()) {
      onToast("请填写需要修改的文字要求", "error");
      return;
    }

    const snapshot = {
      shopName,
      platform,
      currentPlatform,
      generationLine,
      instruction: entry.instruction,
    };

    patchEntry(kind, { item: { ...emptyItem(kind), status: "queued" } });
    try {
      const syncedImages = await ensureUploadedImagesOnOss(entry.images);
      const syncedReferenceImages = await ensureUploadedImagesOnOss(entry.referenceImages);
      const sourceReferences = resolveImageEditSourceReferences(syncedImages);
      const optionalReferenceUrls = resolveImageEditSourceReferences(syncedReferenceImages);
      const requestReferences = resolveImageEditReferences(
        syncedImages,
        syncedReferenceImages,
        snapshot.instruction
      );
      const referenceUrl = sourceReferences[0] || "";
      patchEntry(kind, {
        images: syncedImages,
        referenceImages: syncedReferenceImages,
        item: { ...emptyItem(kind), status: "running" },
      });
      const productName = resolveImageEditProductName(syncedImages);
      const generated = await runWithAutoRetry({
        onAttempt: (attempt) =>
          patchEntry(kind, { item: { ...emptyItem(kind), status: "running", attempt } }),
        run: () =>
          generateAsset({
            kind,
            shopName: snapshot.shopName || "修改图片",
            productName,
            platform: snapshot.platform,
            currentPlatform: snapshot.currentPlatform,
            sourceImages: syncedImages,
            avatar: emptyItem("avatar"),
            storefront: emptyItem("storefront"),
            referenceImages: requestReferences,
            promptOverride: buildImageEditPrompt({
              kind,
              instruction: snapshot.instruction,
              referenceUrl,
              referenceUrls: sourceReferences,
              optionalReferenceUrls,
              shopName: snapshot.shopName,
              productName,
            }),
            promptConfig: buildImageEditPromptConfig({
              kind,
              label: IMAGE_EDIT_LABEL[kind],
              instruction: snapshot.instruction,
              sourceReferenceUrls: sourceReferences,
              optionalReferenceUrls,
              shopName: snapshot.shopName,
              productName,
            }),
            avatarMode: "image",
            avatarCategory: "",
            generationLine: snapshot.generationLine,
          }),
      });
      const item: GenerationItem = {
        kind,
        rawBase64: generated.rawBase64,
        rawDataUrl: generated.rawDataUrl,
        remoteUrl: generated.remoteUrl,
        generationLine: generated.generationLine,
        status: "succeeded",
        elapsedMs: generated.elapsedMs,
        attempt: generated.attempt,
        historyRecorded: generated.historyRecorded,
        historyError: generated.historyError,
        productName: generated.productName,
      };
      patchEntry(kind, { item });
      onRecordHistory(kind, item, snapshot.shopName, snapshot.platform);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      patchEntry(kind, {
        item: {
          ...emptyItem(kind),
          status: "failed",
          errorMessage: message,
          attempt: getAutoRetryAttempt(error),
        },
      });
      onToast(`修改图片失败：${message}`, "error");
    }
  }

  return generateSingle;
}
