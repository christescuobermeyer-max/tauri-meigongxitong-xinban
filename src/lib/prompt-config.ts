import type { AppearanceOptions, AssetKind, AvatarReferenceMode, Platform } from "../types";
import type { ImageEditKind } from "./image-edit";

export interface RemotePromptConfig {
  key: string;
  variables: Record<string, unknown>;
}

export function buildGenerationPromptConfig(options: {
  kind: AssetKind;
  shopName: string;
  productName?: string;
  platform: Platform;
  avatarMode?: AvatarReferenceMode;
  avatarCategory?: string;
  appearance?: AppearanceOptions;
  includeProductName?: boolean;
}): RemotePromptConfig | undefined {
  const common = buildCommonVariables(options.shopName, options.appearance);
  if (options.kind === "avatar") {
    const category = options.avatarCategory?.trim() ?? "";
    return {
      key: category ? "avatar.category" : "avatar.image",
      variables: { ...common, category, avatarMode: options.avatarMode ?? "image" },
    };
  }
  if (options.kind === "storefront") {
    return {
      key: "storefront",
      variables: { ...common, category: options.avatarCategory?.trim() ?? "" },
    };
  }
  if (options.kind === "poster") {
    return {
      key: "poster",
      variables: { ...common, category: options.avatarCategory?.trim() ?? "" },
    };
  }
  if (options.kind === "product") {
    return buildProductPromptConfig({
      shopName: options.shopName,
      productName: options.productName ?? "",
      platform: options.platform,
      appearance: options.appearance,
      includeProductName: options.includeProductName,
    });
  }
  return undefined;
}

export function buildProductPromptConfig(options: {
  shopName: string;
  productName: string;
  platform: Platform;
  appearance?: AppearanceOptions;
  includeProductName?: boolean;
}): RemotePromptConfig {
  return {
    key: "product.single",
    variables: {
      ...buildCommonVariables(options.shopName, options.appearance),
      productName: options.productName,
      platform: options.platform,
      includeProductName: options.includeProductName !== false,
    },
  };
}

export function buildProductBatchPromptConfig(options: {
  shopName: string;
  productName: string;
  platform: Platform;
  appearance?: AppearanceOptions;
  includeProductName?: boolean;
}): RemotePromptConfig {
  return {
    key: "product.batch",
    variables: {
      ...buildCommonVariables(options.shopName, options.appearance),
      productName: options.productName,
      platform: options.platform,
      includeProductName: options.includeProductName !== false,
    },
  };
}

export function buildPackageImagePromptConfig(options: {
  shopName: string;
  productNames: string[];
  productImageCount?: number;
  platform: Platform;
}): RemotePromptConfig {
  return {
    key: "package.image",
    variables: {
      shopName: options.shopName,
      productNames: options.productNames,
      productImageCount: options.productImageCount,
      platform: options.platform,
    },
  };
}

export function buildPictureWallPromptConfig(options: {
  shopName: string;
  productName: string;
  productOssUrl: string;
  appearance?: AppearanceOptions;
}): RemotePromptConfig {
  return {
    key: "picture_wall",
    variables: {
      ...buildCommonVariables(options.shopName, options.appearance),
      productName: options.productName,
      productOssUrl: options.productOssUrl,
    },
  };
}

export function buildDetailPagePromptConfig(options: {
  shopName: string;
  productName: string;
  productOssUrl: string;
  pageIndex: number;
}): RemotePromptConfig {
  return {
    key: "detail_page",
    variables: {
      shopName: options.shopName,
      productName: options.productName,
      productOssUrl: options.productOssUrl,
      pageIndex: options.pageIndex,
    },
  };
}

export function buildPSignboardPromptConfig(options: {
  sourceUrl: string;
  originalText: string;
  newText: string;
}): RemotePromptConfig {
  return {
    key: "p_signboard",
    variables: {
      sourceUrl: options.sourceUrl,
      originalText: options.originalText,
      newText: options.newText,
    },
  };
}

export function buildDataAnalysisPromptConfig(storeName: string): RemotePromptConfig {
  return {
    key: "data_analysis",
    variables: { storeName },
  };
}

export function buildBrandStoryImagePromptConfig(options: {
  storeName: string;
  category: string;
  promptContent: string;
}): RemotePromptConfig {
  return {
    key: "brand_story.image",
    variables: {
      storeName: options.storeName,
      category: options.category,
      promptContent: options.promptContent,
    },
  };
}

export function buildImageEditPromptConfig(options: {
  kind: ImageEditKind;
  label: string;
  instruction: string;
  sourceReferenceUrls: string[];
  optionalReferenceUrls: string[];
  shopName: string;
  productName?: string;
  batchIndex?: number;
  batchTotal?: number;
}): RemotePromptConfig {
  return {
    key: "image_edit",
    variables: {
      kind: options.kind,
      label: options.label,
      instruction: options.instruction,
      sourceReferenceUrls: options.sourceReferenceUrls,
      optionalReferenceUrls: options.optionalReferenceUrls,
      shopName: options.shopName,
      productName: options.productName ?? "",
      batchIndex: options.batchIndex,
      batchTotal: options.batchTotal,
    },
  };
}

function buildCommonVariables(shopName: string, appearance?: AppearanceOptions) {
  return {
    shopName,
    themeColor: appearance?.themeColor ?? "",
    brandStyle: appearance?.brandStyle ?? "",
  };
}
