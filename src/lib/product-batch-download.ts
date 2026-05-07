import { getGeneratedAssetExportSpec } from "./generated-asset-files";
import { saveGeneratedAsset } from "./save-generated-asset";
import { pickDirectoryPath, resizeAndSaveImage } from "./tauri";
import { replaceFileExtension } from "./utils";
import type { ProductBatchEntry } from "./product-batch";
import type { PlatformSpec } from "../types";

type Toast = (message: string, tone: "error" | "info" | "success") => void;

interface DownloadOptions {
  entries: ProductBatchEntry[];
  shopName: string;
  currentPlatform: PlatformSpec;
  onToast: Toast;
}

export async function downloadProductBatchItem(
  options: DownloadOptions & { sourceImageId: string }
) {
  const entry = options.entries.find((item) => item.sourceImageId === options.sourceImageId);
  if (!entry) {
    options.onToast("未找到对应的生成结果", "error");
    return;
  }

  try {
    const saved = await saveGeneratedAsset(
      "product",
      entry.item,
      options.shopName,
      options.currentPlatform,
      entry.productName
    );
    if (!saved) return;
    options.onToast(`已保存至：${saved}`, "success");
  } catch (error: unknown) {
    options.onToast(`保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

export async function downloadProductBatchItems(options: DownloadOptions) {
  const downloadable = options.entries.filter(
    (entry) => entry.item.status === "succeeded" && entry.item.rawBase64
  );
  if (downloadable.length === 0) {
    options.onToast("暂无可批量下载的全店图", "error");
    return;
  }

  const directoryPath = await pickDirectoryPath("选择全店图批量下载文件夹");
  if (!directoryPath) return;

  try {
    for (const entry of downloadable) {
      const spec = getGeneratedAssetExportSpec(
        "product",
        options.shopName,
        options.currentPlatform,
        entry.productName
      );
      await resizeAndSaveImage({
        base64_data: entry.item.rawBase64!,
        target_width: spec.targetWidth,
        target_height: spec.targetHeight,
        output_path: replaceFileExtension(joinPath(directoryPath, spec.fileName), "jpg"),
        max_bytes: spec.maxBytes,
      });
    }
    options.onToast(`已批量下载 ${downloadable.length} 张全店图`, "success");
  } catch (error: unknown) {
    options.onToast(`批量下载失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

function joinPath(directoryPath: string, fileName: string) {
  if (directoryPath.endsWith("\\") || directoryPath.endsWith("/")) return `${directoryPath}${fileName}`;
  return `${directoryPath}\\${fileName}`;
}
