import {
  buildPosterPrompt,
  buildProductPrompt,
  buildStorefrontPrompt,
} from "./prompts";
import { buildActiveAvatarPrompt, resolveAvatarReferenceImages } from "./avatar-generation";
import { selectProductUploadReferenceImages } from "./reference-images";
import { resolveGenerationSize } from "./generation-size";
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

export function buildGenerationPayload(
  kind: AssetKind,
  shopName: string,
  productName: string,
  platform: Platform,
  currentPlatform: PlatformSpec,
  sourceImages: UploadedImage[],
  _avatar: GenerationItem,
  _storefront: GenerationItem,
  override?: string[],
  avatarMode: AvatarReferenceMode = "image",
  avatarCategory = "",
  promptOverride?: string,
  generationLine: GenerationLine = "line1",
  appearance: AppearanceOptions = {}
) {
  const prompt =
    promptOverride ??
    (kind === "avatar"
      ? buildActiveAvatarPrompt({
          shopName,
          mode: avatarMode,
          category: avatarCategory,
          appearance,
        })
      : kind === "storefront"
        ? buildStorefrontPrompt(shopName, avatarCategory, appearance)
        : kind === "poster"
          ? buildPosterPrompt(shopName, avatarCategory, appearance)
          : kind === "product"
            ? buildProductPrompt(shopName, productName, platform, appearance)
            : promptOverride ?? "");
  const size = resolveGenerationSize(kind, currentPlatform, generationLine);
  const productImages = resolveReferenceImages(
    kind,
    sourceImages,
    override,
    avatarMode
  );

  return { prompt, size, productImages };
}

export function resolveReferenceImages(
  kind: AssetKind,
  sourceImages: UploadedImage[],
  override?: string[],
  avatarMode: AvatarReferenceMode = "image"
) {
  if (override) return override;
  if (kind === "avatar") return resolveAvatarReferenceImages(avatarMode, sourceImages);
  if (kind === "storefront") return selectProductUploadReferenceImages(sourceImages);
  if (kind === "poster") return selectProductUploadReferenceImages(sourceImages);
  if (kind === "detail_page") return selectProductUploadReferenceImages(sourceImages);
  return selectProductUploadReferenceImages(sourceImages);
}

export function getAssetLabel(kind: AssetKind): string {
  return kind === "avatar"
    ? "头像"
    : kind === "storefront"
      ? "店招"
      : kind === "poster"
        ? "海报"
        : kind === "product"
          ? "产品图"
          : kind === "p_signboard"
            ? "P门头"
            : kind === "picture_wall"
              ? "图片墙"
              : "详情页";
}
