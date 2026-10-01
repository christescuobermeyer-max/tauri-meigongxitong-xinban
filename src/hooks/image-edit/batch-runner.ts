import { buildImageEditPrompt, IMAGE_EDIT_LABEL, resolveImageEditReferences, resolveImageEditSourceReferences, type ImageEditKind } from "../../lib/image-edit";
import { buildImageEditPromptConfig } from "../../lib/prompt-config";
import { generateAsset } from "../../lib/workspace-generation";
import { getAutoRetryAttempt, runWithAutoRetry } from "../../lib/generation-retry";
import { emptyItem } from "../../lib/workspace-session";
import type { GenerationItem, GenerationLine, Platform, PlatformSpec, UploadedImage } from "../../types";
import type { Options } from "./types";
import type { useImageEditState } from "./useImageEditState";
import { resolveImageEditProductName } from "./utils";
type Context = ReturnType<typeof useImageEditState> & Options;

export function createImageEditBatchRunner(context: Context) {
  const { onToast, onRecordHistory, createBatchSetter } = context;
  async function runBatchItem(
    kind: ImageEditKind,
    sourceImage: UploadedImage,
    syncedReferenceImages: UploadedImage[],
    snapshot: {
      shopName: string;
      platform: Platform;
      currentPlatform: PlatformSpec;
      generationLine: GenerationLine;
      instruction: string;
    },
    batchIndex: number,
    batchTotal: number
  ) {
    const setter = createBatchSetter(kind, sourceImage.id);
    const productName = kind === "product" ? resolveImageEditProductName([sourceImage]) : undefined;
    const sourceReferences = resolveImageEditSourceReferences([sourceImage]);
    const optionalReferenceUrls = resolveImageEditSourceReferences(syncedReferenceImages);
    const requestReferences = resolveImageEditReferences([sourceImage], syncedReferenceImages, snapshot.instruction);
    const referenceUrl = sourceReferences[0] || "";

    try {
      const generated = await runWithAutoRetry({
        onAttempt: (attempt) =>
          setter((prev) => ({ ...prev, status: "running", errorMessage: undefined, attempt })),
        run: () =>
          generateAsset({
            kind,
            shopName: snapshot.shopName || "修改图片",
            productName,
            historyProductName: productName,
            platform: snapshot.platform,
            currentPlatform: snapshot.currentPlatform,
            sourceImages: [sourceImage],
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
              batchIndex,
              batchTotal,
            }),
            promptConfig: buildImageEditPromptConfig({
              kind,
              label: IMAGE_EDIT_LABEL[kind],
              instruction: snapshot.instruction,
              sourceReferenceUrls: sourceReferences,
              optionalReferenceUrls,
              shopName: snapshot.shopName,
              productName,
              batchIndex,
              batchTotal,
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
      setter(item);
      onRecordHistory(kind, item, snapshot.shopName, snapshot.platform);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setter((prev) => ({
        ...prev,
        status: "failed",
        errorMessage: message,
        attempt: getAutoRetryAttempt(error) ?? prev.attempt,
      }));
      onToast(`第 ${batchIndex} 张修改失败：${message}`, "error");
    }
  }

  return runBatchItem;
}
