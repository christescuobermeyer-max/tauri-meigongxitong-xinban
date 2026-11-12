import type { GenerationItem } from "../../types";
import { imageBase64ToDataUrl } from "../oss-image-download";

export const ANIMATION_SOURCE_EVENT = "csgh:product-animation-source";
export interface AnimationSourceRequest { url: string; name: string }
export function openProductAnimation(source: AnimationSourceRequest) {
  window.dispatchEvent(new CustomEvent<AnimationSourceRequest>(ANIMATION_SOURCE_EVENT, { detail: source }));
}
export function animateGenerationItem(item: GenerationItem, name: string) {
  const url = item.rawDataUrl || (item.rawBase64 ? imageBase64ToDataUrl(item.rawBase64) : item.remoteUrl);
  if (url) openProductAnimation({ url, name });
}
