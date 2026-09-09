import { archiveGeneratedImage } from "./oss-assets";
import { buildGenerationPayload } from "./generation-flow";
import { generateArchivedImageWithLine, generateImageWithLine, getBackendGatewayUrl } from "./tauri";
import { safeFileName } from "./utils";
import type {
  AppearanceOptions,
  AssetKind,
  AvatarReferenceMode,
  GenerationLine,
  GenerationItem,
  Platform,
  PlatformSpec,
  UploadedImage,
} from "../types";

export interface GenerateAssetResult {
  rawBase64: string;
  rawDataUrl: string;
  remoteUrl: string;
  generationLine: GenerationLine;
  elapsedMs: number;
  attempt?: number;
  historyRecorded?: boolean;
  historyError?: string;
}

export interface GenerateAssetBase64Result {
  rawBase64: string;
  rawDataUrl: string;
  generationLine: GenerationLine;
  elapsedMs: number;
  remoteUrl?: string;
  archiveError?: string;
  historyRecorded?: boolean;
  historyError?: string;
}

export function getMissingReferenceMessage(kind: AssetKind): string {
  return kind === "storefront"
    ? "请上传至少 1 张产品图，再生成店招"
    : kind === "poster"
      ? "请上传至少 1 张产品图，再生成海报"
      : "请上传至少 1 张产品图";
}

export interface GenerateAssetOptions {
  kind: AssetKind;
  shopName: string;
  productName?: string;
  platform: Platform;
  currentPlatform: PlatformSpec;
  sourceImages: UploadedImage[];
  avatar: GenerationItem;
  storefront: GenerationItem;
  referenceImages?: string[];
  avatarMode?: AvatarReferenceMode;
  avatarCategory?: string;
  promptOverride?: string;
  generationLine: GenerationLine;
  appearance?: AppearanceOptions;
}

export async function generateAssetBase64(
  options: GenerateAssetOptions
): Promise<GenerateAssetBase64Result> {
  const {
    kind,
    shopName,
    productName = "",
    platform,
    currentPlatform,
    sourceImages,
    avatar,
    storefront,
    referenceImages,
    avatarMode = "image",
    avatarCategory = "",
    promptOverride,
    generationLine,
    appearance = {},
  } = options;
  const { prompt, size, productImages } = buildGenerationPayload(
    kind,
    shopName,
    productName,
    platform,
    currentPlatform,
    sourceImages,
    avatar,
    storefront,
    referenceImages,
    avatarMode,
    avatarCategory,
    promptOverride,
    generationLine,
    appearance
  );

  if (shouldRequireReferenceImages(kind, avatarMode) && (!productImages || productImages.length === 0)) {
    throw new Error(getMissingReferenceMessage(kind));
  }

  const referenceImagesForRequest = productImages ?? [];
  const started = Date.now();
  const request = {
    prompt,
    size,
    product_images: referenceImagesForRequest,
    api_line: "auto",
  } as const;
  const generated = getBackendGatewayUrl()
    ? await generateArchivedImageWithLine(request, {
        asset_kind: kind,
        file_name_stem: `${safeFileName(shopName)}-${kind}`,
        shop_name: shopName,
        platform,
      })
    : await generateImageWithLine(request);

  return {
    rawBase64: generated.image,
    rawDataUrl: generated.imageDataUrl,
    generationLine: generated.generationLine,
    elapsedMs: Date.now() - started,
    remoteUrl: generated.archiveUrl,
    archiveError: generated.archiveError,
    historyRecorded: generated.historyRecorded,
    historyError: generated.historyError,
  };
}

export async function archiveAssetToOss(
  kind: AssetKind,
  shopName: string,
  rawBase64: string
): Promise<string> {
  return archiveGeneratedImage(kind, shopName, rawBase64);
}

/** @deprecated 使用 generateAssetBase64 + archiveAssetToOss 分离生图与归档时机 */
export async function generateAsset(options: GenerateAssetOptions): Promise<GenerateAssetResult> {
  const generated = await generateAssetBase64(options);
  const remoteUrl =
    generated.remoteUrl ??
    (generated.archiveError ? "" : await archiveAssetToOss(options.kind, options.shopName, generated.rawBase64));
  return {
    rawBase64: generated.rawBase64,
    rawDataUrl: generated.rawDataUrl,
    remoteUrl,
    generationLine: generated.generationLine,
    elapsedMs: generated.elapsedMs,
    historyRecorded: generated.historyRecorded,
    historyError: generated.historyError,
  };
}

function shouldRequireReferenceImages(kind: AssetKind, avatarMode: AvatarReferenceMode) {
  return kind === "storefront" || kind === "poster" || kind === "product" || avatarMode === "image";
}
