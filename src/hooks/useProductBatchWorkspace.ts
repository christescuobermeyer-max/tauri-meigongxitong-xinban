import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  BrandStyle,
  GenerationItem,
  Platform,
  PlatformSpec,
  ThemeColor,
  UploadedImage,
} from "../types";
import { getPlatform } from "../lib/platforms";
import { downloadProductBatchItem, downloadProductBatchItems } from "../lib/product-batch-download";
import {
  applyProductBatchEntryUpdate,
  buildProductBatchEntries,
  getProductBatchCompletedCount,
  hasBusyProductBatchEntries,
  PRODUCT_BATCH_MAX_IMAGES,
  syncProductBatchEntries,
  type ProductBatchEntry,
} from "../lib/product-batch";
import {
  syncImagesWithOss,
} from "../lib/workspace-session";

import type { Options, ProductBatchProductNameMode } from "./product-batch/types";
import { createProductBatchRunner } from "./product-batch/generation";
export type { ProductBatchProductNameMode } from "./product-batch/types";

export default function useProductBatchWorkspace({
  generationLine,
  setGenerationLine,
  onToast,
  onRecordHistory,
}: Options) {
  const [shopName, setShopName] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [themeColor, setThemeColor] = useState<ThemeColor | "">("");
  const [brandStyle, setBrandStyle] = useState<BrandStyle | "">("");
  const [productNameMode, setProductNameMode] = useState<ProductBatchProductNameMode>("with");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [styleImages, setStyleImages] = useState<UploadedImage[]>([]);
  const [entries, setEntries] = useState<ProductBatchEntry[]>([]);
  const [uploadingOss, setUploadingOss] = useState(false);

  const currentPlatform: PlatformSpec | null = platform ? getPlatform(platform) : null;

  useEffect(() => {
    setEntries((previous) => syncProductBatchEntries(images, previous));
  }, [images]);

  const busy = uploadingOss || hasBusyProductBatchEntries(entries);
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
    if (images.length > PRODUCT_BATCH_MAX_IMAGES) {
      onToast(`制作全店图最多支持 ${PRODUCT_BATCH_MAX_IMAGES} 张产品图`, "error");
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

  const runBatchItem = createProductBatchRunner({ onToast, onRecordHistory, createProductSetter });

  async function handleGenerate() {
    if (uploadingOss) return;
    if (!validateInputs() || !platform || !currentPlatform) return;

    const snapshot = {
      shopName: shopName.trim(),
      platform,
      currentPlatform,
      generationLine,
      themeColor,
      brandStyle,
      productNameMode,
    };

    setUploadingOss(true);
    onToast(`正在上传 ${images.length + styleImages.length} 张素材到 OSS，请稍候…`, "info");

    let syncedImages: UploadedImage[];
    let syncedStyleImages: UploadedImage[];
    try {
      ({ syncedImages, syncedStyleImages } = await syncBatchImages());
    } catch (error: unknown) {
      onToast(
        `上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      setUploadingOss(false);
      return;
    }
    setUploadingOss(false);

    setEntries(buildProductBatchEntries(syncedImages, "queued"));
    onToast("素材上传完成，开始批量生成全店图，请耐心等待…", "info");

    for (const image of syncedImages) {
      await runBatchItem(image, syncedStyleImages, snapshot);
    }
  }

  async function retry(sourceImageId: string) {
    if (uploadingOss) return null;
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return null;
    }
    const sourceImage = images.find((item) => item.id === sourceImageId);
    if (!sourceImage) {
      onToast("未找到对应的产品图", "error");
      return null;
    }
    if (styleImages.length === 0) {
      onToast("请先上传参考设计风格图", "error");
      return null;
    }

    const snapshot = {
      shopName: shopName.trim(),
      platform,
      currentPlatform,
      generationLine,
      themeColor,
      brandStyle,
      productNameMode,
    };

    setUploadingOss(true);
    let syncedImages: UploadedImage[];
    let syncedStyleImages: UploadedImage[];
    try {
      ({ syncedImages, syncedStyleImages } = await syncBatchImages());
    } catch (error: unknown) {
      onToast(
        `上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      setUploadingOss(false);
      return null;
    }
    setUploadingOss(false);

    const syncedImage = syncedImages.find((item) => item.id === sourceImageId);
    if (!syncedImage) {
      onToast("未找到对应的产品图", "error");
      return null;
    }

    return await runBatchItem(syncedImage, syncedStyleImages, snapshot);
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
    shopName,
    setShopName,
    platform,
    setPlatform,
    generationLine,
    setGenerationLine,
    currentPlatform,
    themeColor,
    setThemeColor,
    brandStyle,
    setBrandStyle,
    productNameMode,
    setProductNameMode,
    images,
    setImages,
    styleImages,
    setStyleImages,
    entries,
    busy,
    uploadingOss,
    completedCount,
    handleGenerate,
    retry,
    download,
    downloadAll,
  };
}
