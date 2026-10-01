import type { Dispatch, SetStateAction } from "react";
import type { GenerationItem } from "../../types";
import { buildProductBatchPromptConfig } from "../../lib/prompt-config";
import { buildProductBatchPrompt } from "../../lib/prompts";
import { resolveProductBatchReferenceImages } from "../../lib/product-batch";
import { emptyItem, runOneGeneration, type RunOneResult } from "../../lib/workspace-session";
import type { Platform, PlatformSpec, GenerationLine, ThemeColor, BrandStyle, UploadedImage } from "../../types";
import type { ProductBatchProductNameMode, Options } from "./types";

const noopSetter: Dispatch<SetStateAction<GenerationItem>> = () => undefined;

export function createProductBatchRunner({ onToast, onRecordHistory, createProductSetter }: Pick<Options, "onToast" | "onRecordHistory"> & {
  createProductSetter: (id: string) => Dispatch<SetStateAction<GenerationItem>>;
}) {
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
      productNameMode: ProductBatchProductNameMode;
    }
  ): Promise<RunOneResult | null> {
    const resolvedProductName = sourceImage.productName.trim() || "未命名产品";
    const includeProductName = snapshot.productNameMode === "with";
    const productNameForGeneration = includeProductName ? resolvedProductName : "";
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
      promptOverride: buildProductBatchPrompt(
        snapshot.shopName,
        resolvedProductName,
        snapshot.platform,
        appearance,
        { includeProductName }
      ),
      promptConfig: buildProductBatchPromptConfig({
        shopName: snapshot.shopName,
        productName: resolvedProductName,
        platform: snapshot.platform,
        appearance,
        includeProductName,
      }),
      setters: {
        avatar: noopSetter,
        storefront: noopSetter,
        poster: noopSetter,
        product: createProductSetter(sourceImage.id),
      },
      shopName: snapshot.shopName,
      productName: productNameForGeneration,
      historyProductName: resolvedProductName,
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
        historyRecorded: result.historyRecorded,
        historyError: result.historyError,
        productName: result.productName,
      },
      snapshot.shopName,
      snapshot.platform
    );

    return result;
  }

  return runBatchItem;
}
