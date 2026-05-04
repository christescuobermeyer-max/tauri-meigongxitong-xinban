import { safeFileName } from "./utils";
import { uploadImageToOss } from "./tauri";
import type { AssetKind, UploadedImage } from "../types";

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
  const uploaded = await uploadImageToOss({
    base64_data: rawBase64,
    folder: "generated",
    file_name: `${safeFileName(shopName)}-${kind}.png`,
  });

  return uploaded.url;
}
