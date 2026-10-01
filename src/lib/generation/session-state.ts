import { ensureUploadedImagesOnOss } from "../oss-assets";
import type { AssetKind, GenerationItem, UploadedImage } from "../../types";
import type { GenerationSetters } from "./session-types";

export function emptyItem(kind: AssetKind): GenerationItem {
  return {
    kind,
    rawBase64: null,
    rawDataUrl: null,
    status: "idle",
  };
}

export function isBusyStatus(status: GenerationItem["status"]) {
  return status === "running" || status === "queued";
}

export function getSetterByKind(kind: AssetKind, setters: GenerationSetters) {
  return kind === "avatar"
    ? setters.avatar
    : kind === "storefront"
      ? setters.storefront
      : kind === "poster"
        ? setters.poster
        : setters.product;
}

export async function syncImagesWithOss(
  images: UploadedImage[],
  setImages: (next: UploadedImage[]) => void
) {
  const synced = await ensureUploadedImagesOnOss(images);
  if (synced !== images) setImages(synced);
  return synced;
}

export function markFailedItem(
  kind: AssetKind,
  message: string,
  setters: GenerationSetters
) {
  getSetterByKind(kind, setters)((prev) => ({
    ...prev,
    status: "failed",
    errorMessage: message,
  }));
}

export function queueGenerationItems(kinds: AssetKind[], setters: GenerationSetters) {
  for (const kind of kinds) {
    getSetterByKind(kind, setters)({ ...emptyItem(kind), status: "queued" });
  }
}
