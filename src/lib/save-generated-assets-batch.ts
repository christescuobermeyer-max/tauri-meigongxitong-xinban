import { buildBatchDownloadPlans } from "./generated-asset-files";
import { pickDirectoryPath, resizeAndSaveImage } from "./tauri";
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
    const saved = await resizeAndSaveImage({
      base64_data: plan.rawBase64,
      target_width: plan.targetWidth,
      target_height: plan.targetHeight,
      output_path: plan.outputPath,
      max_bytes: plan.maxBytes,
    });
    savedPaths.push(saved);
  }

  return savedPaths;
}
