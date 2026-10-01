import type { UploadedImage } from "../../types";

export function resolveImageEditProductName(images: UploadedImage[]) {
  const names = images.map((image) => image.productName.trim()).filter(Boolean);
  return names.length ? names.join("、") : undefined;
}
