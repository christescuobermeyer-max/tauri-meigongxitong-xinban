import { archiveGeneratedImage } from "./oss-assets";
import { buildGenerationPayload, getAssetLabel } from "./generation-flow";
import { generateImage } from "./tauri";
import type {
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
  remoteUrl?: string;
  generationLine: GenerationLine;
  elapsedMs: number;
  archiveErrorMessage?: string;
}

export function getMissingReferenceMessage(kind: AssetKind): string {
  return kind === "storefront"
    ? "请先生成头像，再生成店招"
    : kind === "poster"
      ? "请先生成并归档店招，再生成海报"
      : "请上传至少 1 张产品图";
}

export async function generateAsset(options: {
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
}): Promise<GenerateAssetResult> {
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
    promptOverride
  );

  if (shouldRequireReferenceImages(kind, avatarMode) && (!productImages || productImages.length === 0)) {
    throw new Error(getMissingReferenceMessage(kind));
  }

  const referenceImagesForRequest = productImages ?? [];
  const started = Date.now();
  const generated = {
    base64_data: await generateImage({
      prompt,
      size,
      product_images: referenceImagesForRequest,
      api_line: generationLine,
    }),
    mime_type: "image/png",
  };

  let remoteUrl: string | undefined;
  let archiveErrorMessage: string | undefined;
  try {
    remoteUrl = await archiveGeneratedImage(kind, shopName, generated.base64_data);
  } catch (error: unknown) {
    archiveErrorMessage = `${getAssetLabel(kind)}已生成，但归档到 OSS 失败：${
      error instanceof Error ? error.message : String(error)
    }`;
  }

  return {
    rawBase64: generated.base64_data,
    rawDataUrl: `data:${generated.mime_type};base64,${generated.base64_data}`,
    remoteUrl,
    generationLine,
    elapsedMs: Date.now() - started,
    archiveErrorMessage,
  };
}

function shouldRequireReferenceImages(kind: AssetKind, avatarMode: AvatarReferenceMode) {
  return kind === "storefront" || kind === "poster" || kind === "product" || avatarMode === "image";
}
