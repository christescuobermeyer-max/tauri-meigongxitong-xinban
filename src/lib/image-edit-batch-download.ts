import { getGeneratedAssetExportSpec } from "./generated-asset-files";
import { PICTURE_WALL_EXPORT_SIZE, PICTURE_WALL_SOURCE_SIZE } from "./picture-wall";
import { saveGeneratedAsset } from "./save-generated-asset";
import { pickDirectoryPath, resizeAndSaveImage, saveBase64Image } from "./tauri";
import { replaceFileExtension, safeFileName } from "./utils";
import type { ImageEditBatchEntry, ImageEditKind } from "./image-edit";
import type { PlatformSpec } from "../types";

type Toast = (message: string, tone: "error" | "info" | "success") => void;

interface DownloadOptions {
  kind: ImageEditKind;
  entries: ImageEditBatchEntry[];
  shopName: string;
  currentPlatform: PlatformSpec;
  onToast: Toast;
}

export async function downloadImageEditBatchItem(
  options: DownloadOptions & { sourceImageId: string }
) {
  const entry = options.entries.find((item) => item.sourceImageId === options.sourceImageId);
  if (!entry) {
    options.onToast("未找到对应的修改结果", "error");
    return;
  }

  try {
    const saved = await saveGeneratedAsset(
      options.kind,
      entry.item,
      options.shopName || "修改图片",
      options.currentPlatform,
      options.kind === "product" ? entry.productName : undefined
    );
    if (saved) options.onToast(`已保存至：${saved}`, "success");
  } catch (error: unknown) {
    options.onToast(`保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

export async function downloadImageEditBatchItems(options: DownloadOptions) {
  const downloadable = options.entries.filter(
    (entry) => entry.item.status === "succeeded" && entry.item.rawBase64
  );
  if (downloadable.length === 0) {
    options.onToast("暂无可批量下载的修改结果", "error");
    return;
  }

  const directoryPath = await pickDirectoryPath("选择修改图片批量下载文件夹");
  if (!directoryPath) return;

  try {
    const savedPaths: string[] = [];
    for (const [index, entry] of downloadable.entries()) {
      const rawBase64 = entry.item.rawBase64!;
      if (options.kind === "picture_wall") {
        savedPaths.push(
          ...(await savePictureWallBatchPair(rawBase64, options.shopName, entry, index, directoryPath))
        );
        continue;
      }

      const exportShopName = buildBatchFileStem(options.shopName, entry, index);
      const spec = getGeneratedAssetExportSpec(
        options.kind,
        exportShopName,
        options.currentPlatform,
        options.kind === "product" ? entry.productName : undefined
      );
      const outputPath = joinPath(
        directoryPath,
        options.kind === "product" ? replaceFileExtension(spec.fileName, "jpg") : spec.fileName
      );

      savedPaths.push(
        spec.saveOriginal
          ? await saveBase64Image({
              base64_data: rawBase64,
              output_path: outputPath,
            })
          : await resizeAndSaveImage({
              base64_data: rawBase64,
              target_width: requireTargetSize(spec.targetWidth, "宽度"),
              target_height: requireTargetSize(spec.targetHeight, "高度"),
              output_path: outputPath,
              max_bytes: spec.maxBytes,
            })
      );
    }
    options.onToast(`已批量下载 ${downloadable.length} 张修改图片`, "success");
  } catch (error: unknown) {
    options.onToast(`批量下载失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function savePictureWallBatchPair(
  rawBase64: string,
  shopName: string,
  entry: ImageEditBatchEntry,
  index: number,
  directoryPath: string
) {
  const stem = buildBatchFileStem(shopName, entry, index);
  const paths: string[] = [];
  paths.push(
    await resizeAndSaveImage({
      base64_data: rawBase64,
      target_width: PICTURE_WALL_SOURCE_SIZE.w,
      target_height: PICTURE_WALL_SOURCE_SIZE.h,
      output_path: joinPath(directoryPath, `${stem}_图片墙_高清原图.png`),
    })
  );
  paths.push(
    await resizeAndSaveImage({
      base64_data: rawBase64,
      target_width: PICTURE_WALL_EXPORT_SIZE.w,
      target_height: PICTURE_WALL_EXPORT_SIZE.h,
      output_path: joinPath(
        directoryPath,
        `${stem}_图片墙_${PICTURE_WALL_EXPORT_SIZE.w}x${PICTURE_WALL_EXPORT_SIZE.h}.png`
      ),
    })
  );
  return paths;
}

function buildBatchFileStem(shopName: string, entry: ImageEditBatchEntry, index: number) {
  const shopStem = safeFileName(shopName || "修改图片");
  const imageStem = safeFileName(entry.productName || entry.sourceName || `图片${index + 1}`);
  return `${shopStem}_${String(index + 1).padStart(2, "0")}_${imageStem}`;
}

function joinPath(directoryPath: string, fileName: string) {
  if (directoryPath.endsWith("\\") || directoryPath.endsWith("/")) return `${directoryPath}${fileName}`;
  return `${directoryPath}\\${fileName}`;
}

function requireTargetSize(value: number | undefined, label: string) {
  if (!value) throw new Error(`导出尺寸缺少${label}`);
  return value;
}
