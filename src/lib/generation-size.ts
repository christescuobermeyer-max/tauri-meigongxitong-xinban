import type { AssetKind, GenerationLine, PlatformSpec } from "../types";

const IMAGE_GENERATION_STOREFRONT_SIZE = "1536x1024";
const POCKGO_STOREFRONT_RATIO = "16:9";

export function resolveStorefrontGenerationSize(line: GenerationLine = "line1") {
  return line === "line2" ? POCKGO_STOREFRONT_RATIO : IMAGE_GENERATION_STOREFRONT_SIZE;
}

export function resolveGenerationSize(
  kind: AssetKind,
  currentPlatform: PlatformSpec,
  line: GenerationLine = "line1"
) {
  if (kind === "avatar") return "1024x1024";
  if (kind === "storefront" || kind === "p_signboard") {
    return resolveStorefrontGenerationSize(line);
  }
  if (kind === "poster") return currentPlatform.poster.sourceLabel;
  return `${currentPlatform.product.source.w}x${currentPlatform.product.source.h}`;
}
