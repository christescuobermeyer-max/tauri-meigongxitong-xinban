import { getGeneratedAssetExportSpec } from "./generated-asset-files";
import { saveEditedPictureWallPair } from "./picture-wall-download";
import { replaceFileExtension } from "./utils";
import { pickSavePath, resizeAndSaveImage, saveBase64Image } from "./tauri";
import type { AssetKind, GenerationItem, PlatformSpec } from "../types";

export async function saveGeneratedAsset(
  kind: AssetKind,
  item: GenerationItem,
  shopName: string,
  currentPlatform: PlatformSpec,
  productName?: string
): Promise<string | null> {
  if (item.status !== "succeeded" || !item.rawBase64) return null;

  // 图片墙特殊：选一个文件夹，自动保存两个尺寸（1086×1448 + 240×330），与"图片墙生成"工具一致
  if (kind === "picture_wall") {
    const result = await saveEditedPictureWallPair(item.rawBase64, shopName);
    return result ? result.directory : null;
  }

  const spec = getGeneratedAssetExportSpec(kind, shopName, currentPlatform, productName);

  if (spec.saveOriginal) {
    const selectedPath = await pickSavePath(spec.fileName);
    if (!selectedPath) return null;
    return await saveBase64Image({
      base64_data: item.rawBase64,
      output_path: selectedPath,
    });
  }

  if (kind === "product") {
    const selectedPath = await pickSavePath(spec.fileName, [
      { name: "JPEG 图像", extensions: ["jpg", "jpeg"] },
    ]);
    if (!selectedPath) return null;

    const outputPath = replaceFileExtension(selectedPath, "jpg");
    return await resizeAndSaveImage({
      base64_data: item.rawBase64,
      target_width: requireTargetSize(spec.targetWidth, "宽度"),
      target_height: requireTargetSize(spec.targetHeight, "高度"),
      output_path: outputPath,
      max_bytes: spec.maxBytes,
    });
  }

  if (kind === "detail_page") {
    const selectedPath = await pickSavePath(spec.fileName);
    if (!selectedPath) return null;
    return await resizeAndSaveImage({
      base64_data: item.rawBase64,
      target_width: requireTargetSize(spec.targetWidth, "宽度"),
      target_height: requireTargetSize(spec.targetHeight, "高度"),
      output_path: selectedPath,
    });
  }

  const selectedPath = await pickSavePath(spec.fileName);
  if (!selectedPath) return null;

  return await resizeAndSaveImage({
    base64_data: item.rawBase64,
    target_width: requireTargetSize(spec.targetWidth, "宽度"),
    target_height: requireTargetSize(spec.targetHeight, "高度"),
    output_path: selectedPath,
  });
}

function requireTargetSize(value: number | undefined, label: string) {
  if (!value) throw new Error(`导出尺寸缺少${label}`);
  return value;
}
