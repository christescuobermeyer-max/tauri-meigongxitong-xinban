import {
  buildPosterPrompt,
  buildProductPrompt,
  buildStorefrontPrompt,
} from "./prompts";
import { buildActiveAvatarPrompt, resolveAvatarReferenceImages } from "./avatar-generation";
import {
  selectPosterReferenceImages,
  selectProductUploadReferenceImages,
  selectStorefrontReferenceImages,
} from "./reference-images";
import type {
  AssetKind,
  AvatarReferenceMode,
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
  avatar: GenerationItem,
  storefront: GenerationItem,
  override?: string[],
  avatarMode: AvatarReferenceMode = "image",
  avatarCategory = "",
  promptOverride?: string
) {
  const prompt =
    promptOverride ??
    (kind === "avatar"
      ? buildActiveAvatarPrompt({
          shopName,
          mode: avatarMode,
          category: avatarCategory,
        })
      : kind === "storefront"
        ? buildStorefrontPrompt(shopName)
        : kind === "poster"
          ? buildPosterPrompt(shopName)
          : buildProductPrompt(shopName, productName, platform));
  const size =
    kind === "avatar"
      ? "1024x1024"
      : kind === "storefront"
        ? "1536x1024"
        : kind === "poster"
          ? currentPlatform.poster.sourceLabel
          : `${currentPlatform.product.source.w}x${currentPlatform.product.source.h}`;
  const productImages = resolveReferenceImages(
    kind,
    sourceImages,
    avatar,
    storefront,
    override,
    avatarMode
  );

  return { prompt, size, productImages };
}

export function resolveReferenceImages(
  kind: AssetKind,
  sourceImages: UploadedImage[],
  avatar: GenerationItem,
  storefront: GenerationItem,
  override?: string[],
  avatarMode: AvatarReferenceMode = "image"
) {
  if (override) return override;
  if (kind === "avatar") return resolveAvatarReferenceImages(avatarMode, sourceImages);
  if (kind === "storefront") return selectStorefrontReferenceImages(avatar);
  if (kind === "poster") return selectPosterReferenceImages(storefront);
  return selectProductUploadReferenceImages(sourceImages);
}

export function getAssetLabel(kind: AssetKind): string {
  return kind === "avatar"
    ? "头像"
    : kind === "storefront"
      ? "店招"
      : kind === "poster"
        ? "海报"
        : "产品图";
}
