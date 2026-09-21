import { useState, type Dispatch, type SetStateAction } from "react";
import {
  applyImageEditBatchEntryUpdate,
  buildImageEditBatchEntries,
  buildImageEditPrompt,
  getImageEditSourceMaxCount,
  hasBusyImageEditBatchEntries,
  IMAGE_EDIT_LABEL,
  IMAGE_EDIT_KINDS,
  resolveImageEditReferences,
  resolveImageEditSourceReferences,
  syncImageEditBatchEntries,
  type ImageEditBatchEntry,
  type ImageEditKind,
  type ImageEditMode,
} from "../lib/image-edit";
import { buildImageEditPromptConfig } from "../lib/prompt-config";
import {
  downloadImageEditBatchItem,
  downloadImageEditBatchItems,
} from "../lib/image-edit-batch-download";
import { ensureUploadedImagesOnOss } from "../lib/oss-assets";
import { getPlatform } from "../lib/platforms";
import { generateAsset } from "../lib/workspace-generation";
import { getAutoRetryAttempt, runWithAutoRetry } from "../lib/generation-retry";
import { saveGeneratedAsset } from "../lib/save-generated-asset";
import { emptyItem, isBusyStatus } from "../lib/workspace-session";
import type {
  AssetKind,
  GenerationItem,
  GenerationLine,
  Platform,
  PlatformSpec,
  UploadedImage,
} from "../types";

interface Entry {
  images: UploadedImage[];
  referenceImages: UploadedImage[];
  instruction: string;
  item: GenerationItem;
  batchEntries: ImageEditBatchEntry[];
}

type Entries = Record<ImageEditKind, Entry>;

interface Options {
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (
    kind: AssetKind,
    item: GenerationItem,
    shopName: string,
    platform: Platform
  ) => void;
}

function createEntries(): Entries {
  return IMAGE_EDIT_KINDS.reduce((acc, kind) => {
    acc[kind] = {
      images: [],
      referenceImages: [],
      instruction: "",
      item: emptyItem(kind),
      batchEntries: [],
    };
    return acc;
  }, {} as Entries);
}

export default function useImageEditWorkspace(options: Options) {
  const { generationLine, onToast, onRecordHistory } = options;
  const [shopName, setShopName] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [mode, setModeState] = useState<ImageEditMode>("single");
  const [entries, setEntries] = useState<Entries>(() => createEntries());

  const currentPlatform: PlatformSpec | null = platform ? getPlatform(platform) : null;
  const busy = IMAGE_EDIT_KINDS.some(
    (kind) => isBusyStatus(entries[kind].item.status) || hasBusyImageEditBatchEntries(entries[kind].batchEntries)
  );

  function patchEntry(kind: ImageEditKind, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
  }

  function setMode(nextMode: ImageEditMode) {
    if (busy) return;
    setModeState(nextMode);
    if (nextMode !== "single") return;

    setEntries((prev) => {
      const next = { ...prev };
      for (const kind of IMAGE_EDIT_KINDS) {
        const images = prev[kind].images.slice(0, getImageEditSourceMaxCount(kind, "single"));
        next[kind] = {
          ...prev[kind],
          images,
          batchEntries: syncImageEditBatchEntries(kind, images, prev[kind].batchEntries),
        };
      }
      return next;
    });
  }

  function setImages(kind: ImageEditKind, images: UploadedImage[]) {
    setEntries((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        images,
        batchEntries: syncImageEditBatchEntries(kind, images, prev[kind].batchEntries),
      },
    }));
  }

  function setReferenceImages(kind: ImageEditKind, referenceImages: UploadedImage[]) {
    patchEntry(kind, { referenceImages });
  }

  function setInstruction(kind: ImageEditKind, instruction: string) {
    patchEntry(kind, { instruction });
  }

  async function generate(kind: ImageEditKind) {
    if (mode === "batch") {
      await generateBatch(kind);
      return;
    }
    await generateSingle(kind);
  }

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

  async function generateBatch(kind: ImageEditKind) {
    const entry = entries[kind];
    if (busy) return;
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    if (entry.images.length === 0) {
      onToast(`请先上传需要批量修改的${kind === "product" ? "产品图" : "图片"}`, "error");
      return;
    }
    if (entry.images.length > getImageEditSourceMaxCount(kind, "batch")) {
      onToast(`批量修改最多支持 ${getImageEditSourceMaxCount(kind, "batch")} 张图片`, "error");
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

    patchEntry(kind, {
      item: emptyItem(kind),
      batchEntries: buildImageEditBatchEntries(kind, entry.images, "queued"),
    });
    onToast(`正在上传 ${entry.images.length + entry.referenceImages.length} 张素材到 OSS，请稍候…`, "info");

    let syncedImages: UploadedImage[];
    let syncedReferenceImages: UploadedImage[];
    try {
      syncedImages = await ensureUploadedImagesOnOss(entry.images);
      syncedReferenceImages = await ensureUploadedImagesOnOss(entry.referenceImages);
      patchEntry(kind, {
        images: syncedImages,
        referenceImages: syncedReferenceImages,
        batchEntries: buildImageEditBatchEntries(kind, syncedImages, "queued"),
      });
    } catch (error: unknown) {
      patchEntry(kind, {
        batchEntries: buildImageEditBatchEntries(kind, entry.images, "idle"),
      });
      onToast(`上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }

    onToast(`素材上传完成，开始批量逐张修改 ${syncedImages.length} 张图片，请耐心等待…`, "info");
    for (const [index, image] of syncedImages.entries()) {
      await runBatchItem(kind, image, syncedReferenceImages, snapshot, index + 1, syncedImages.length);
    }
  }

  function createBatchSetter(
    kind: ImageEditKind,
    sourceImageId: string
  ): Dispatch<SetStateAction<GenerationItem>> {
    return (next) => {
      setEntries((prev) => ({
        ...prev,
        [kind]: {
          ...prev[kind],
          batchEntries: applyImageEditBatchEntryUpdate(prev[kind].batchEntries, sourceImageId, next),
        },
      }));
    };
  }

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

  async function retryBatchItem(kind: ImageEditKind, sourceImageId: string) {
    const entry = entries[kind];
    if (busy) return;
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    const sourceImage = entry.images.find((image) => image.id === sourceImageId);
    if (!sourceImage) {
      onToast("未找到对应的原图", "error");
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
    createBatchSetter(kind, sourceImageId)({ ...emptyItem(kind), status: "queued" });

    try {
      const syncedImages = await ensureUploadedImagesOnOss(entry.images);
      const syncedReferenceImages = await ensureUploadedImagesOnOss(entry.referenceImages);
      setEntries((prev) => ({
        ...prev,
        [kind]: {
          ...prev[kind],
          images: syncedImages,
          referenceImages: syncedReferenceImages,
          batchEntries: syncImageEditBatchEntries(kind, syncedImages, prev[kind].batchEntries),
        },
      }));
      const syncedImage = syncedImages.find((image) => image.id === sourceImageId);
      if (!syncedImage) {
        onToast("未找到对应的原图", "error");
        return;
      }
      const index = syncedImages.findIndex((image) => image.id === sourceImageId);
      await runBatchItem(kind, syncedImage, syncedReferenceImages, snapshot, index + 1, syncedImages.length);
    } catch (error: unknown) {
      createBatchSetter(kind, sourceImageId)((prev) => ({
        ...prev,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
      onToast(`重新修改失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function download(kind: ImageEditKind) {
    const entry = entries[kind];
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    try {
      const productName = kind === "product" ? resolveImageEditProductName(entry.images) : undefined;
      const saved = await saveGeneratedAsset(kind, entry.item, shopName || "修改图片", currentPlatform, productName);
      if (saved) onToast(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      onToast(`保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function downloadBatchItem(kind: ImageEditKind, sourceImageId: string) {
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    await downloadImageEditBatchItem({
      kind,
      entries: entries[kind].batchEntries,
      sourceImageId,
      shopName,
      currentPlatform,
      onToast,
    });
  }

  async function downloadBatchAll(kind: ImageEditKind) {
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    await downloadImageEditBatchItems({
      kind,
      entries: entries[kind].batchEntries,
      shopName,
      currentPlatform,
      onToast,
    });
  }

  return {
    shopName,
    setShopName,
    platform,
    setPlatform,
    mode,
    setMode,
    currentPlatform,
    entries,
    busy,
    setImages,
    setReferenceImages,
    setInstruction,
    generate,
    retryBatchItem,
    download,
    downloadBatchItem,
    downloadBatchAll,
  };
}

function resolveImageEditProductName(images: UploadedImage[]) {
  const names = images.map((image) => image.productName.trim()).filter(Boolean);
  return names.length ? names.join("、") : undefined;
}
