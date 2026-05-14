import { buildAvatarCategoryPrompt, buildAvatarPrompt } from "./prompts";
import { selectAvatarReferenceImages } from "./reference-images";
import type { AppearanceOptions, AvatarReferenceMode, UploadedImage } from "../types";

interface AvatarPromptOptions {
  shopName: string;
  mode: AvatarReferenceMode;
  category: string;
  appearance?: AppearanceOptions;
}

interface AvatarValidationOptions {
  shopName: string;
  mode: AvatarReferenceMode;
  category: string;
  images: UploadedImage[];
}

export function buildActiveAvatarPrompt(options: AvatarPromptOptions): string {
  const { shopName, category, appearance } = options;
  return category.trim()
    ? buildAvatarCategoryPrompt(shopName, category, appearance ?? {})
    : buildAvatarPrompt(shopName, appearance ?? {});
}

export function getAvatarGenerationErrorMessage(
  options: AvatarValidationOptions
): string | null {
  const { shopName, category, images } = options;
  if (!shopName.trim()) return "请填写店铺名称";
  if (!category.trim()) return "请填写店铺经营品类";
  if (images.length === 0) return "请上传至少 1 张产品图";
  return null;
}

export function resolveAvatarReferenceImages(
  _mode: AvatarReferenceMode,
  images: Array<{ productOssUrl?: string; base64?: string }>
): string[] {
  return selectAvatarReferenceImages(
    images.map((item) => item.productOssUrl || item.base64).filter((item): item is string => Boolean(item))
  );
}
