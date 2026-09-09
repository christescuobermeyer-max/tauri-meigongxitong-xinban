import { buildBatchDownloadPlans } from "./generated-asset-files";
import { pickDirectoryPath, resizeAndSaveImage, saveBase64Image } from "./tauri";
import type { GenerationItem, PlatformSpec } from "../types";

export async function saveGeneratedAssetsBatch(
  items: {
    avatar: GenerationItem;
    storefront: GenerationItem;
    poster: GenerationItem;
  },
  shopName: string,
  currentPlatform: PlatformSpec
): Promise<string[] | null> {
  const directoryPath = await pickDirectoryPath("选择批量下载文件夹");
  if (!directoryPath) return null;

  const plans = buildBatchDownloadPlans(items, shopName, currentPlatform, directoryPath);
  const savedPaths: string[] = [];

  for (const plan of plans) {
    const saved = plan.saveOriginal
      ? await saveBase64Image({
          base64_data: plan.rawBase64,
          output_path: plan.outputPath,
        })
      : await resizeAndSaveImage({
          base64_data: plan.rawBase64,
          target_width: requireTargetSize(plan.targetWidth, "宽度"),
          target_height: requireTargetSize(plan.targetHeight, "高度"),
          output_path: plan.outputPath,
          max_bytes: plan.maxBytes,
        });
    savedPaths.push(saved);
  }

  return savedPaths;
}

function requireTargetSize(value: number | undefined, label: string) {
  if (!value) throw new Error(`导出尺寸缺少${label}`);
  return value;
}
