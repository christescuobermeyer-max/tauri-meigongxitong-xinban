import type { AssetKind, GenerationLine, PlatformSpec } from "../types";

const IMAGE_GENERATION_STOREFRONT_SIZE = "1536x1024";
const DETAIL_PAGE_GENERATION_SIZE = "1024x1536";
const POCKGO_STOREFRONT_RATIO = "16:9";
const YUNWU_STOREFRONT_SIZE = "1792x768";
const YUNWU_POSTER_SIZE = "1792x768";

export function resolveStorefrontGenerationSize(line: GenerationLine = "line1") {
  if (line === "line2" || line === "line6") return YUNWU_STOREFRONT_SIZE;
  return line === "line4" || line === "line5" ? POCKGO_STOREFRONT_RATIO : IMAGE_GENERATION_STOREFRONT_SIZE;
}

export function resolvePSignboardGenerationSize(line: GenerationLine = "line1") {
  return line === "line5" ? "auto" : resolveStorefrontGenerationSize(line);
}

export function resolveGenerationSize(
  kind: AssetKind,
  currentPlatform: PlatformSpec,
  line: GenerationLine = "line1"
) {
  if (line === "line5") return resolveApimartGenerationSize(kind, currentPlatform);
  if (kind === "avatar") return "1024x1024";
  if (kind === "storefront" || kind === "p_signboard") {
    return resolveStorefrontGenerationSize(line);
  }
  if (kind === "poster") {
    return line === "line2" || line === "line6"
      ? YUNWU_POSTER_SIZE
      : currentPlatform.poster.sourceLabel;
  }
  if (kind === "detail_page") return DETAIL_PAGE_GENERATION_SIZE;
  if (kind === "product") return formatSize(currentPlatform.product.source);
  return IMAGE_GENERATION_STOREFRONT_SIZE;
}

function resolveApimartGenerationSize(kind: AssetKind, currentPlatform: PlatformSpec) {
  if (kind === "avatar") return "1:1";
  if (kind === "storefront") return "16:9";
  if (kind === "poster") return "21:9";
  if (kind === "p_signboard") return "auto";
  if (kind === "product") return currentPlatform.id === "taobao" ? "1:1" : "4:3";
  if (kind === "detail_page") return DETAIL_PAGE_GENERATION_SIZE;
  return IMAGE_GENERATION_STOREFRONT_SIZE;
}

function formatSize(size: { w: number; h: number }) {
  return `${size.w}x${size.h}`;
}
