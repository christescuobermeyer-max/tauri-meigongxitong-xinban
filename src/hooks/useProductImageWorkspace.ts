import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getPlatform } from "../lib/platforms";
import { saveGeneratedAsset } from "../lib/save-generated-asset";
import {
  emptyItem,
  isBusyStatus,
  runOneGeneration,
  syncImagesWithOss,
  type RunOneResult,
} from "../lib/workspace-session";
import type {
  AssetKind,
  BrandStyle,
  GenerationItem,
  GenerationLine,
  Platform,
  PlatformSpec,
  ThemeColor,
  UploadedImage,
} from "../types";

const noopSetter: Dispatch<SetStateAction<GenerationItem>> = () => undefined;

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

export default function useProductImageWorkspace(options: Options) {
  const { generationLine, onToast, onRecordHistory } = options;
  const [shopName, setShopName] = useState("");
  const [productName, setProductName] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [themeColor, setThemeColor] = useState<ThemeColor | "">("");
  const [brandStyle, setBrandStyle] = useState<BrandStyle | "">("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [product, setProduct] = useState<GenerationItem>(emptyItem("product"));

  const currentPlatform: PlatformSpec | null = platform ? getPlatform(platform) : null;
  const busy = isBusyStatus(product.status);

  useEffect(() => {
    if (productName.trim()) return;
    const firstName = images[0]?.productName?.trim();
    if (firstName) setProductName(firstName);
  }, [images, productName]);

  function buildSetters() {
    return {
      avatar: noopSetter,
      storefront: noopSetter,
      poster: noopSetter,
      product: setProduct,
    };
  }

  function validate() {
    if (!shopName.trim()) {
      onToast("请填写店铺名称", "error");
      return false;
    }
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return false;
    }
    if (!productName.trim()) {
      onToast("请填写产品名称", "error");
      return false;
    }
    if (images.length === 0) {
      onToast("请上传至少 1 张产品图", "error");
      return false;
    }
    return true;
  }

  async function syncImagesToOss() {
    return await syncImagesWithOss(images, setImages);
  }

  function recordResult(result: RunOneResult, shopNameSnapshot: string, platformSnapshot: Platform) {
    const item: GenerationItem = {
      kind: "product",
      rawBase64: result.rawBase64,
      rawDataUrl: result.rawDataUrl,
      remoteUrl: result.remoteUrl,
      generationLine: result.generationLine,
      status: "succeeded",
      elapsedMs: result.elapsedMs,
      attempt: result.attempt,
    };
    onRecordHistory("product", item, shopNameSnapshot, platformSnapshot);
  }

  async function runProduct(snapshot: {
    shopName: string;
    productName: string;
    platform: Platform;
    currentPlatform: PlatformSpec;
    generationLine: GenerationLine;
    themeColor: ThemeColor | "";
    brandStyle: BrandStyle | "";
  }) {
    let syncedImages: UploadedImage[];
    try {
      syncedImages = await syncImagesToOss();
    } catch (error: unknown) {
      onToast(
        `上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      return null;
    }

    const result = await runOneGeneration({
      kind: "product",
      sourceImages: syncedImages,
      setters: buildSetters(),
      shopName: snapshot.shopName,
      productName: snapshot.productName,
      platform: snapshot.platform,
      currentPlatform: snapshot.currentPlatform,
      avatar: emptyItem("avatar"),
      storefront: emptyItem("storefront"),
      avatarMode: "image",
      avatarCategory: "",
      generationLine: snapshot.generationLine,
      appearance: {
        themeColor: snapshot.themeColor || undefined,
        brandStyle: snapshot.brandStyle || undefined,
      },
      onToast,
    });

    if (result) recordResult(result, snapshot.shopName, snapshot.platform);
    return result;
  }

  async function handleGenerate() {
    if (!validate() || !platform || !currentPlatform) return;

    const snapshot = {
      shopName: shopName.trim(),
      productName: productName.trim(),
      platform,
      currentPlatform,
      generationLine,
      themeColor,
      brandStyle,
    };

    setProduct({ ...emptyItem("product"), status: "queued" });
    onToast("正在根据产品图重新设计产品主图，请耐心等待…", "info");

    await runProduct(snapshot);
  }

  async function retry() {
    if (!validate() || !platform || !currentPlatform) return null;

    const snapshot = {
      shopName: shopName.trim(),
      productName: productName.trim(),
      platform,
      currentPlatform,
      generationLine,
      themeColor,
      brandStyle,
    };

    return await runProduct(snapshot);
  }

  async function handleDownload() {
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    const extracted = images[0]?.productName?.trim() || productName.trim();
    try {
      const saved = await saveGeneratedAsset("product", product, shopName, currentPlatform, extracted);
      if (!saved) return;
      onToast(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      onToast(
        `保存失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  return {
    shopName,
    setShopName,
    productName,
    setProductName,
    platform,
    setPlatform,
    currentPlatform,
    themeColor,
    setThemeColor,
    brandStyle,
    setBrandStyle,
    images,
    setImages,
    product,
    busy,
    handleGenerate,
    retry,
    handleDownload,
  };
}
