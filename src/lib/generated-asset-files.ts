import { safeFileName } from "./utils";
import type { AssetKind, GenerationItem, PlatformSpec } from "../types";

interface AssetExportSpec {
  fileName: string;
  targetWidth: number;
  targetHeight: number;
  maxBytes?: number;
}

export interface BatchDownloadPlan {
  kind: "avatar" | "storefront" | "poster";
  rawBase64: string;
  outputPath: string;
  targetWidth: number;
  targetHeight: number;
  maxBytes?: number;
}

export function canBatchDownloadAssets(items: GenerationItem[]) {
  return items.every((item) => item.status === "succeeded" && Boolean(item.rawBase64));
}

export function getGeneratedAssetExportSpec(
  kind: AssetKind,
  shopName: string,
  currentPlatform: PlatformSpec,
  productName?: string
): AssetExportSpec {
  const stem = safeFileName(shopName);

  if (kind === "product") {
    const target = currentPlatform.product.export;
    const productStem = productName?.trim() || stem;
    return {
      fileName: `${productStem}.jpg`,
      targetWidth: target.w,
      targetHeight: target.h,
      maxBytes: currentPlatform.product.maxBytes,
    };
  }

  if (kind === "poster") {
    const target = currentPlatform.poster.export;
    return {
      fileName: `${stem}_${currentPlatform.id}_poster_${target.w}x${target.h}.png`,
      targetWidth: target.w,
      targetHeight: target.h,
    };
  }

  if (kind === "p_signboard") {
    return {
      fileName: `${stem}_p_signboard_1536x1024.png`,
      targetWidth: 1536,
      targetHeight: 1024,
    };
  }

  const target = kind === "avatar" ? currentPlatform.avatar : currentPlatform.storefront;
  return {
    fileName: `${stem}_${currentPlatform.id}_${kind}_${target.w}x${target.h}.png`,
    targetWidth: target.w,
    targetHeight: target.h,
  };
}

export function buildBatchDownloadPlans(
  items: {
    avatar: GenerationItem;
    storefront: GenerationItem;
    poster: GenerationItem;
  },
  shopName: string,
  currentPlatform: PlatformSpec,
  directoryPath: string
): BatchDownloadPlan[] {
  const orderedKinds = ["avatar", "storefront", "poster"] as const;
  const orderedItems = orderedKinds.map((kind) => ({ kind, item: items[kind] }));

  if (!canBatchDownloadAssets(orderedItems.map((entry) => entry.item))) {
    throw new Error("头像、店招、海报全部生成成功后才能批量下载");
  }

  return orderedItems.map(({ kind, item }) => {
    const spec = getGeneratedAssetExportSpec(kind, shopName, currentPlatform);
    return {
      kind,
      rawBase64: item.rawBase64!,
      outputPath: joinDirectoryAndFileName(directoryPath, spec.fileName),
      targetWidth: spec.targetWidth,
      targetHeight: spec.targetHeight,
      maxBytes: spec.maxBytes,
    };
  });
}

function joinDirectoryAndFileName(directoryPath: string, fileName: string) {
  if (directoryPath.endsWith("\\") || directoryPath.endsWith("/")) {
    return `${directoryPath}${fileName}`;
  }
  return `${directoryPath}\\${fileName}`;
}
