import { useState } from "react";
import {
  buildImageEditPrompt,
  IMAGE_EDIT_KINDS,
  resolveImageEditReferences,
  resolveImageEditSourceReferences,
  type ImageEditKind,
} from "../lib/image-edit";
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
    acc[kind] = { images: [], referenceImages: [], instruction: "", item: emptyItem(kind) };
    return acc;
  }, {} as Entries);
}

export default function useImageEditWorkspace(options: Options) {
  const { generationLine, onToast, onRecordHistory } = options;
  const [shopName, setShopName] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [entries, setEntries] = useState<Entries>(() => createEntries());

  const currentPlatform: PlatformSpec | null = platform ? getPlatform(platform) : null;
  const busy = IMAGE_EDIT_KINDS.some((kind) => isBusyStatus(entries[kind].item.status));

  function patchEntry(kind: ImageEditKind, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
  }

  function setImages(kind: ImageEditKind, images: UploadedImage[]) {
    patchEntry(kind, { images });
  }

  function setReferenceImages(kind: ImageEditKind, referenceImages: UploadedImage[]) {
    patchEntry(kind, { referenceImages });
  }

  function setInstruction(kind: ImageEditKind, instruction: string) {
    patchEntry(kind, { instruction });
  }

  async function generate(kind: ImageEditKind) {
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
      const requestReferences = resolveImageEditReferences(syncedImages, syncedReferenceImages);
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

  return {
    shopName,
    setShopName,
    platform,
    setPlatform,
    currentPlatform,
    entries,
    busy,
    setImages,
    setReferenceImages,
    setInstruction,
    generate,
    download,
  };
}

function resolveImageEditProductName(images: UploadedImage[]) {
  const names = images.map((image) => image.productName.trim()).filter(Boolean);
  return names.length ? names.join("、") : undefined;
}
