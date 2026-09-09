import type { AssetKind, GenerationLine, PlatformSpec } from "../types";

const IMAGE_GENERATION_STOREFRONT_SIZE = "1536x1024";
const DETAIL_PAGE_GENERATION_SIZE = "1024x1536";
const POCKGO_STOREFRONT_RATIO = "16:9";
const YUNWU_STOREFRONT_SIZE = "16:9";
const YUNWU_POSTER_SIZE = "21:9";
const MANXIAOBAI_WIDE_SIZE = "2384x1024";
const NOVAEWORLD_POSTER_SIZE = "1792x768";

export function resolveStorefrontGenerationSize(line: GenerationLine = "line5") {
  if (line === "line2") return YUNWU_STOREFRONT_SIZE;
  if (line === "line6") return MANXIAOBAI_WIDE_SIZE;
  return line === "line4" || line === "line5" ? POCKGO_STOREFRONT_RATIO : IMAGE_GENERATION_STOREFRONT_SIZE;
}

export function resolvePSignboardGenerationSize(line: GenerationLine = "line5") {
  return line === "line5" ? "auto" : resolveStorefrontGenerationSize(line);
}

export function resolveGenerationSize(
  kind: AssetKind,
  currentPlatform: PlatformSpec,
  line: GenerationLine = "line5"
) {
  if (line === "line5") return resolveApimartGenerationSize(kind, currentPlatform);
  if (kind === "avatar") return "1024x1024";
  if (kind === "storefront" || kind === "p_signboard") {
    return resolveStorefrontGenerationSize(line);
  }
  if (kind === "poster") {
    if (line === "line2") return YUNWU_POSTER_SIZE;
    if (line === "line6") return MANXIAOBAI_WIDE_SIZE;
    if (line === "line7") return NOVAEWORLD_POSTER_SIZE;
    return currentPlatform.poster.sourceLabel;
  }
  if (kind === "detail_page") return DETAIL_PAGE_GENERATION_SIZE;
  if (kind === "picture_wall") return "1024x1536";
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
  if (kind === "picture_wall") return "3:4";
  return IMAGE_GENERATION_STOREFRONT_SIZE;
}

function formatSize(size: { w: number; h: number }) {
  return `${size.w}x${size.h}`;
}
