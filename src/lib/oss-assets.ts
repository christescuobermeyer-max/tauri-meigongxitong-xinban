import { safeFileName } from "./utils";
import { uploadImageToOss } from "./tauri";
import { compressGeneratedImage } from "./tauri-image";
import type { AssetKind, UploadedImage } from "../types";

const GENERATED_AVATAR_MAX_DIMENSION = 768;
const GENERATED_AVATAR_JPEG_QUALITY = 82;

export async function ensureUploadedImagesOnOss(
  images: UploadedImage[]
): Promise<UploadedImage[]> {
  let changed = false;

  const next = await Promise.all(
    images.map(async (image) => {
      if (image.productOssUrl) return image;

      const uploaded = await uploadImageToOss({
        base64_data: image.productBase64,
        mime_type: image.mime,
        folder: "uploads",
        file_name: image.name,
      });
      changed = true;

      return {
        ...image,
        productOssUrl: uploaded.url,
      };
    })
  );

  return changed ? next : images;
}

export async function archiveGeneratedImage(
  kind: AssetKind,
  shopName: string,
  rawBase64: string
): Promise<string> {
  if (kind === "avatar") {
    const compressed = await compressGeneratedImage({
      base64_data: rawBase64,
      max_dimension: GENERATED_AVATAR_MAX_DIMENSION,
      quality: GENERATED_AVATAR_JPEG_QUALITY,
    });
    const uploaded = await uploadImageToOss({
      base64_data: compressed.base64_data,
      mime_type: compressed.mime_type,
      folder: "generated",
      file_name: `${safeFileName(shopName)}-${kind}.jpg`,
    });
    return uploaded.url;
  }

  const uploaded = await uploadImageToOss({
    base64_data: rawBase64,
    folder: "generated",
    file_name: `${safeFileName(shopName)}-${kind}.png`,
  });

  return uploaded.url;
}
