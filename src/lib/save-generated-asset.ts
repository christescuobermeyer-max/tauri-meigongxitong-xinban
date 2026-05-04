import { getGeneratedAssetExportSpec } from "./generated-asset-files";
import { replaceFileExtension } from "./utils";
import { pickSavePath, resizeAndSaveImage } from "./tauri";
import type { AssetKind, GenerationItem, PlatformSpec } from "../types";

export async function saveGeneratedAsset(
  kind: AssetKind,
  item: GenerationItem,
  shopName: string,
  currentPlatform: PlatformSpec,
  productName?: string
): Promise<string | null> {
  if (item.status !== "succeeded" || !item.rawBase64) return null;
  const spec = getGeneratedAssetExportSpec(kind, shopName, currentPlatform, productName);

  if (kind === "product") {
    const selectedPath = await pickSavePath(spec.fileName, [
      { name: "JPEG 图像", extensions: ["jpg", "jpeg"] },
    ]);
    if (!selectedPath) return null;

    const outputPath = replaceFileExtension(selectedPath, "jpg");
    return await resizeAndSaveImage({
      base64_data: item.rawBase64,
      target_width: spec.targetWidth,
      target_height: spec.targetHeight,
      output_path: outputPath,
      max_bytes: spec.maxBytes,
    });
  }

  const selectedPath = await pickSavePath(spec.fileName);
  if (!selectedPath) return null;

  return await resizeAndSaveImage({
    base64_data: item.rawBase64,
    target_width: spec.targetWidth,
    target_height: spec.targetHeight,
    output_path: selectedPath,
  });
}
