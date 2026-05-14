import { useState, type Dispatch, type SetStateAction } from "react";
import { getPlatform } from "../lib/platforms";
import {
  buildPackageImagePrompt,
  resolvePackageImageProductName,
  resolvePackageImageProductNames,
  resolvePackageImageReferences,
} from "../lib/package-image";
import { saveGeneratedAsset } from "../lib/save-generated-asset";
import {
  emptyItem,
  runOneGeneration,
  syncImagesWithOss,
  type RunOneResult,
} from "../lib/workspace-session";
import type {
  AssetKind,
  GenerationItem,
  GenerationLine,
  Platform,
  PlatformSpec,
  UploadedImage,
} from "../types";

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

export default function usePackageImageWorkspace({
  generationLine,
  onToast,
  onRecordHistory,
}: Options) {
  const [shopName, setShopName] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [styleImages, setStyleImages] = useState<UploadedImage[]>([]);
  const [item, setItem] = useState<GenerationItem>(() => emptyItem("product"));

  const currentPlatform: PlatformSpec | null = platform ? getPlatform(platform) : null;
  const busy = item.status === "queued" || item.status === "running";
  const productNames = resolvePackageImageProductNames(images);

  function validateInputs() {
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return false;
    }
    if (styleImages.length === 0) {
      onToast("请上传 1 张参考设计风格图", "error");
      return false;
    }
    if (images.length === 0) {
      onToast("请上传至少 1 张套餐产品图", "error");
      return false;
    }
    if (images.length > 4) {
      onToast("套餐图最多支持 4 张产品图", "error");
      return false;
    }
    return true;
  }

  async function syncPackageImages() {
    const syncedStyleImages = await syncImagesWithOss(styleImages, setStyleImages);
    const syncedImages = await syncImagesWithOss(images, setImages);
    return { syncedStyleImages, syncedImages };
  }

  function buildSnapshot(syncedImages: UploadedImage[], syncedStyleImages: UploadedImage[]) {
    if (!platform || !currentPlatform) return null;
    return {
      shopName: shopName.trim() || "套餐图",
      platform,
      currentPlatform,
      generationLine,
      productName: resolvePackageImageProductName(syncedImages),
      productNames: resolvePackageImageProductNames(syncedImages),
      referenceImages: resolvePackageImageReferences(syncedStyleImages, syncedImages),
    };
  }

  async function runPackageGeneration(): Promise<RunOneResult | null> {
    if (!validateInputs()) return null;

    setItem({ ...emptyItem("product"), status: "queued" });
    let syncedImages: UploadedImage[];
    let syncedStyleImages: UploadedImage[];
    try {
      ({ syncedImages, syncedStyleImages } = await syncPackageImages());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setItem({ ...emptyItem("product"), status: "failed", errorMessage: message });
      onToast(`上传参考图到 OSS 失败：${message}`, "error");
      return null;
    }

    const snapshot = buildSnapshot(syncedImages, syncedStyleImages);
    if (!snapshot) return null;
    if (snapshot.referenceImages.length !== syncedImages.length + 1) {
      setItem({ ...emptyItem("product"), status: "failed", errorMessage: "参考图上传状态异常" });
      onToast("参考设计风格图或产品图上传状态异常，请重新上传后再试", "error");
      return null;
    }

    onToast("正在参考设计风格制作套餐图，请耐心等待…", "info");
    const result = await runOneGeneration({
      kind: "product",
      sourceImages: syncedImages,
      referenceImages: snapshot.referenceImages,
      promptOverride: buildPackageImagePrompt(snapshot),
      setters: {
        avatar: noopSetter,
        storefront: noopSetter,
        poster: noopSetter,
        product: setItem,
      },
      shopName: snapshot.shopName,
      productName: snapshot.productName,
      platform: snapshot.platform,
      currentPlatform: snapshot.currentPlatform,
      avatar: emptyItem("avatar"),
      storefront: emptyItem("storefront"),
      avatarMode: "image",
      avatarCategory: "",
      generationLine: snapshot.generationLine,
      onToast,
    });

    if (result) {
      onRecordHistory("product", { ...itemFromResult(result), kind: "product" }, snapshot.shopName, snapshot.platform);
    }
    return result;
  }

  async function download() {
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    const productName = resolvePackageImageProductName(images);
    const saved = await saveGeneratedAsset("product", item, shopName || "套餐图", currentPlatform, productName);
    if (saved) onToast(`已保存至：${saved}`, "success");
  }

  return {
    shopName,
    setShopName,
    platform,
    setPlatform,
    currentPlatform,
    images,
    setImages,
    styleImages,
    setStyleImages,
    productNames,
    item,
    busy,
    handleGenerate: runPackageGeneration,
    retry: runPackageGeneration,
    download,
  };
}

function itemFromResult(result: RunOneResult): GenerationItem {
  return {
    kind: "product",
    rawBase64: result.rawBase64,
    rawDataUrl: result.rawDataUrl,
    remoteUrl: result.remoteUrl,
    generationLine: result.generationLine,
    status: "succeeded",
    elapsedMs: result.elapsedMs,
    attempt: result.attempt,
  };
}
