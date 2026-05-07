import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AvatarReferenceMode,
  GenerationLine,
  GenerationItem,
  Platform,
  PlatformSpec,
  UploadedImage,
} from "../types";
import { buildProductBatchPrompt } from "../lib/prompts";
import { downloadProductBatchItem, downloadProductBatchItems } from "../lib/product-batch-download";
import {
  applyProductBatchEntryUpdate,
  buildProductBatchEntries,
  getProductBatchCompletedCount,
  hasBusyProductBatchEntries,
  resolveProductBatchReferenceImages,
  syncProductBatchEntries,
  type ProductBatchEntry,
} from "../lib/product-batch";
import { runOneGeneration, syncImagesWithOss, type RunOneResult } from "../lib/workspace-session";

interface UseProductBatchWorkspaceOptions {
  shopName: string;
  platform: Platform | null;
  currentPlatform: PlatformSpec | null;
  avatar: GenerationItem;
  storefront: GenerationItem;
  avatarMode: AvatarReferenceMode;
  avatarCategory: string;
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordProductHistory: (item: GenerationItem) => void;
}

const noopSetter: Dispatch<SetStateAction<GenerationItem>> = () => undefined;

export default function useProductBatchWorkspace({
  shopName,
  platform,
  currentPlatform,
  avatar,
  storefront,
  avatarMode,
  avatarCategory,
  generationLine,
  onToast,
  onRecordProductHistory,
}: UseProductBatchWorkspaceOptions) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [styleImages, setStyleImages] = useState<UploadedImage[]>([]);
  const [entries, setEntries] = useState<ProductBatchEntry[]>([]);

  useEffect(() => {
    setEntries((previous) => syncProductBatchEntries(images, previous));
  }, [images]);

  const busy = hasBusyProductBatchEntries(entries);
  const completedCount = getProductBatchCompletedCount(entries);

  function validateInputs() {
    if (!shopName.trim()) {
      onToast("请填写店铺名称", "error");
      return false;
    }
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return false;
    }
    if (images.length === 0) {
      onToast("请上传至少 1 张产品图", "error");
      return false;
    }
    if (styleImages.length === 0) {
      onToast("请上传 1 张参考设计风格图", "error");
      return false;
    }
    return true;
  }

  async function syncBatchImages() {
    const syncedImages = await syncImagesWithOss(images, setImages);
    const syncedStyleImages = await syncImagesWithOss(styleImages, setStyleImages);
    return { syncedImages, syncedStyleImages };
  }

  function createProductSetter(sourceImageId: string): Dispatch<SetStateAction<GenerationItem>> {
    return (next) => {
      setEntries((previous) => applyProductBatchEntryUpdate(previous, sourceImageId, next));
    };
  }

  async function runBatchItem(
    sourceImage: UploadedImage,
    syncedStyleImages: UploadedImage[]
  ): Promise<RunOneResult | null> {
    const productName = sourceImage.productName.trim() || "未命名产品";
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return null;
    }
    const referenceImages = resolveProductBatchReferenceImages(syncedStyleImages, sourceImage);
    if (referenceImages.length < 2) {
      onToast("参考设计风格图或产品图上传状态异常，请重新上传后再试", "error");
      return null;
    }

    const result = await runOneGeneration({
      kind: "product",
      sourceImages: [sourceImage],
      referenceImages,
      promptOverride: buildProductBatchPrompt(shopName, productName, platform),
      setters: {
        avatar: noopSetter,
        storefront: noopSetter,
        poster: noopSetter,
        product: createProductSetter(sourceImage.id),
      },
      shopName,
      productName,
      platform,
      currentPlatform,
      avatar,
      storefront,
      avatarMode,
      avatarCategory,
      generationLine,
      onToast,
    });

    if (!result) return null;

    onRecordProductHistory({
      kind: "product",
      rawBase64: result.rawBase64,
      rawDataUrl: result.rawDataUrl,
      remoteUrl: result.remoteUrl,
      generationLine: result.generationLine,
      status: "succeeded",
      elapsedMs: result.elapsedMs,
      attempt: result.attempt,
    });

    return result;
  }

  async function handleGenerate() {
    if (!validateInputs()) return;

    let syncedImages: UploadedImage[];
    let syncedStyleImages: UploadedImage[];
    try {
      ({ syncedImages, syncedStyleImages } = await syncBatchImages());
    } catch (error: unknown) {
      onToast(`上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }

    setEntries(buildProductBatchEntries(syncedImages, "queued"));
    onToast("正在参考设计风格批量制作全店图，请耐心等待…", "info");

    for (const image of syncedImages) {
      await runBatchItem(image, syncedStyleImages);
    }
  }

  async function retry(sourceImageId: string) {
    const sourceImage = images.find((item) => item.id === sourceImageId);
    if (!sourceImage) {
      onToast("未找到对应的产品图", "error");
      return null;
    }
    if (styleImages.length === 0) {
      onToast("请先上传参考设计风格图", "error");
      return null;
    }
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return null;
    }

    let syncedImages: UploadedImage[];
    let syncedStyleImages: UploadedImage[];
    try {
      ({ syncedImages, syncedStyleImages } = await syncBatchImages());
    } catch (error: unknown) {
      onToast(`上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`, "error");
      return null;
    }

    const syncedImage = syncedImages.find((item) => item.id === sourceImageId);
    if (!syncedImage) {
      onToast("未找到对应的产品图", "error");
      return null;
    }

    return await runBatchItem(syncedImage, syncedStyleImages);
  }

  async function download(sourceImageId: string) {
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    await downloadProductBatchItem({ entries, sourceImageId, shopName, currentPlatform, onToast });
  }

  async function downloadAll() {
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    await downloadProductBatchItems({ entries, shopName, currentPlatform, onToast });
  }

  return {
    images, setImages, styleImages, setStyleImages, entries, busy, completedCount,
    handleGenerate, retry, download, downloadAll,
  };
}
