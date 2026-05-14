import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AssetKind,
  BrandStyle,
  GenerationLine,
  GenerationItem,
  Platform,
  PlatformSpec,
  ThemeColor,
  UploadedImage,
} from "../types";
import { getPlatform } from "../lib/platforms";
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
import {
  emptyItem,
  runOneGeneration,
  syncImagesWithOss,
  type RunOneResult,
} from "../lib/workspace-session";

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

const noopSetter: Dispatch<SetStateAction<GenerationItem>> = () => undefined;

export default function useProductBatchWorkspace({
  generationLine,
  onToast,
  onRecordHistory,
}: Options) {
  const [shopName, setShopName] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [themeColor, setThemeColor] = useState<ThemeColor | "">("");
  const [brandStyle, setBrandStyle] = useState<BrandStyle | "">("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [styleImages, setStyleImages] = useState<UploadedImage[]>([]);
  const [entries, setEntries] = useState<ProductBatchEntry[]>([]);

  const currentPlatform: PlatformSpec | null = platform ? getPlatform(platform) : null;

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
    syncedStyleImages: UploadedImage[],
    snapshot: {
      shopName: string;
      platform: Platform;
      currentPlatform: PlatformSpec;
      generationLine: GenerationLine;
      themeColor: ThemeColor | "";
      brandStyle: BrandStyle | "";
    }
  ): Promise<RunOneResult | null> {
    const productName = sourceImage.productName.trim() || "未命名产品";
    const referenceImages = resolveProductBatchReferenceImages(syncedStyleImages, sourceImage);
    if (referenceImages.length < 2) {
      onToast("参考设计风格图或产品图上传状态异常，请重新上传后再试", "error");
      return null;
    }

    const appearance = {
      themeColor: snapshot.themeColor || undefined,
      brandStyle: snapshot.brandStyle || undefined,
    };

    const result = await runOneGeneration({
      kind: "product",
      sourceImages: [sourceImage],
      referenceImages,
      promptOverride: buildProductBatchPrompt(snapshot.shopName, productName, snapshot.platform, appearance),
      setters: {
        avatar: noopSetter,
        storefront: noopSetter,
        poster: noopSetter,
        product: createProductSetter(sourceImage.id),
      },
      shopName: snapshot.shopName,
      productName,
      platform: snapshot.platform,
      currentPlatform: snapshot.currentPlatform,
      avatar: emptyItem("avatar"),
      storefront: emptyItem("storefront"),
      avatarMode: "image",
      avatarCategory: "",
      generationLine: snapshot.generationLine,
      onToast,
    });

    if (!result) return null;

    onRecordHistory(
      "product",
      {
        kind: "product",
        rawBase64: result.rawBase64,
        rawDataUrl: result.rawDataUrl,
        remoteUrl: result.remoteUrl,
        generationLine: result.generationLine,
        status: "succeeded",
        elapsedMs: result.elapsedMs,
        attempt: result.attempt,
      },
      snapshot.shopName,
      snapshot.platform
    );

    return result;
  }

  async function handleGenerate() {
    if (!validateInputs() || !platform || !currentPlatform) return;

    const snapshot = {
      shopName: shopName.trim(),
      platform,
      currentPlatform,
      generationLine,
      themeColor,
      brandStyle,
    };

    let syncedImages: UploadedImage[];
    let syncedStyleImages: UploadedImage[];
    try {
      ({ syncedImages, syncedStyleImages } = await syncBatchImages());
    } catch (error: unknown) {
      onToast(
        `上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      return;
    }

    setEntries(buildProductBatchEntries(syncedImages, "queued"));
    onToast("正在参考设计风格批量制作全店图，请耐心等待…", "info");

    for (const image of syncedImages) {
      await runBatchItem(image, syncedStyleImages, snapshot);
    }
  }

  async function retry(sourceImageId: string) {
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
    };

    let syncedImages: UploadedImage[];
    let syncedStyleImages: UploadedImage[];
    try {
      ({ syncedImages, syncedStyleImages } = await syncBatchImages());
    } catch (error: unknown) {
      onToast(
        `上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      return null;
    }

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
    currentPlatform,
    themeColor,
    setThemeColor,
    brandStyle,
    setBrandStyle,
    images,
    setImages,
    styleImages,
    setStyleImages,
    entries,
    busy,
    completedCount,
    handleGenerate,
    retry,
    download,
    downloadAll,
  };
}
