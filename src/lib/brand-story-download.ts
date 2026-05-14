import { pickDirectoryPath, pickSavePath, resizeAndSaveImage } from "./tauri";
import { safeFileName } from "./utils";
import type { BrandStoryImageEntry } from "./brand-story";

/** 按宽高比解析下载尺寸（参考模型常见原图尺寸） */
function resolveExportSize(aspectRatio: string): { w: number; h: number } {
  switch (aspectRatio) {
    case "3:2":
      return { w: 1536, h: 1024 };
    case "16:9":
      return { w: 1792, h: 1024 };
    case "4:3":
      return { w: 1024, h: 768 };
    default:
      return { w: 1024, h: 1024 };
  }
}

function buildFileName(shopName: string, entry: BrandStoryImageEntry): string {
  const size = resolveExportSize(entry.aspectRatio);
  return `${safeFileName(shopName)}_品牌故事_${entry.index}_${entry.name}_${size.w}x${size.h}.png`;
}

function joinPath(directoryPath: string, fileName: string): string {
  if (directoryPath.endsWith("\\") || directoryPath.endsWith("/")) {
    return `${directoryPath}${fileName}`;
  }
  return `${directoryPath}\\${fileName}`;
}

export async function downloadBrandStoryEntry(
  entry: BrandStoryImageEntry,
  shopName: string
): Promise<string | null> {
  if (entry.item.status !== "succeeded" || !entry.item.rawBase64) return null;
  const fileName = buildFileName(shopName, entry);
  const selectedPath = await pickSavePath(fileName);
  if (!selectedPath) return null;
  const size = resolveExportSize(entry.aspectRatio);
  return await resizeAndSaveImage({
    base64_data: entry.item.rawBase64,
    target_width: size.w,
    target_height: size.h,
    output_path: selectedPath,
  });
}

export async function downloadBrandStoryEntries(
  entries: BrandStoryImageEntry[],
  shopName: string
): Promise<string[] | null> {
  const completed = entries.filter(
    (entry) => entry.item.status === "succeeded" && entry.item.rawBase64
  );
  if (completed.length === 0) return [];

  const directoryPath = await pickDirectoryPath("选择品牌故事下载文件夹");
  if (!directoryPath) return null;

  const savedPaths: string[] = [];
  for (const entry of completed) {
    const size = resolveExportSize(entry.aspectRatio);
    savedPaths.push(
      await resizeAndSaveImage({
        base64_data: entry.item.rawBase64!,
        target_width: size.w,
        target_height: size.h,
        output_path: joinPath(directoryPath, buildFileName(shopName, entry)),
      })
    );
  }
  return savedPaths;
}
