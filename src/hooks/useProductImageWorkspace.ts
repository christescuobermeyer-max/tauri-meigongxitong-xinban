import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getPlatform } from "../lib/platforms";
import { buildProductPrompt } from "../lib/prompts";
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
export type ProductImageProductNameMode = "with" | "without";

interface Options {
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (
    kind: AssetKind,
    item: GenerationItem,
    shopName: string,
    platform: Platform
  ) => void;
}

export default function useProductImageWorkspace(options: Options) {
  const { generationLine, setGenerationLine, onToast, onRecordHistory } = options;
  const [shopName, setShopName] = useState("");
  const [productName, setProductName] = useState("");
  const [productNameMode, setProductNameMode] = useState<ProductImageProductNameMode>("with");
  // 记录上一次从图片自动填入 productName 的值；用户手动改过后这里不变，于是再换图也不会覆盖用户输入。
  const [autoFilledProductName, setAutoFilledProductName] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [themeColor, setThemeColor] = useState<ThemeColor | "">("");
  const [brandStyle, setBrandStyle] = useState<BrandStyle | "">("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [product, setProduct] = useState<GenerationItem>(emptyItem("product"));

  const currentPlatform: PlatformSpec | null = platform ? getPlatform(platform) : null;
  const busy = isBusyStatus(product.status);

  useEffect(() => {
    const firstName = images[0]?.productName?.trim() ?? "";
    if (!firstName) return;
    const current = productName.trim();
    // 允许自动覆盖的两种情况：
    //  1) 输入框为空
    //  2) 当前值正是"上一次自动填入"的内容（用户没改过）
    // 否则视为用户已手动编辑，保留用户输入。
    if (!current || current === autoFilledProductName) {
      setProductName(firstName);
      setAutoFilledProductName(firstName);
    }
  }, [images]);

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
    if (productNameMode === "with" && !productName.trim()) {
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
      historyRecorded: result.historyRecorded,
      historyError: result.historyError,
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
    productNameMode: ProductImageProductNameMode;
  }) {
    const includeProductName = snapshot.productNameMode === "with";
    const productNameForGeneration = includeProductName ? snapshot.productName : "";
    const appearance = {
      themeColor: snapshot.themeColor || undefined,
      brandStyle: snapshot.brandStyle || undefined,
    };

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
      productName: productNameForGeneration,
      platform: snapshot.platform,
      currentPlatform: snapshot.currentPlatform,
      avatar: emptyItem("avatar"),
      storefront: emptyItem("storefront"),
      avatarMode: "image",
      avatarCategory: "",
      generationLine: snapshot.generationLine,
      promptOverride: buildProductPrompt(
        snapshot.shopName,
        snapshot.productName,
        snapshot.platform,
        appearance,
        { includeProductName }
      ),
      appearance,
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
      productNameMode,
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
      productNameMode,
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
    generationLine,
    setGenerationLine,
    shopName,
    setShopName,
    productName,
    setProductName,
    productNameMode,
    setProductNameMode,
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
