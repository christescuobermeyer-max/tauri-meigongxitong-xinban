import { pickDirectoryPath, pickSavePath, resizeAndSaveImage } from "./tauri";
import { replaceFileExtension, safeFileName } from "./utils";
import {
  BRAND_STORY_MAX_BYTES,
  getBrandStoryExportSize,
  type BrandStoryImageEntry,
} from "./brand-story";

function buildFileName(shopName: string, entry: BrandStoryImageEntry): string {
  const { w, h } = getBrandStoryExportSize(entry);
  return `${safeFileName(shopName)}_品牌故事_${entry.index}_${entry.name}_${w}x${h}.jpg`;
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
  const { w, h } = getBrandStoryExportSize(entry);
  return await resizeAndSaveImage({
    base64_data: entry.item.rawBase64,
    target_width: w,
    target_height: h,
    output_path: replaceFileExtension(selectedPath, "jpg"),
    max_bytes: BRAND_STORY_MAX_BYTES,
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
    const { w, h } = getBrandStoryExportSize(entry);
    savedPaths.push(
      await resizeAndSaveImage({
        base64_data: entry.item.rawBase64!,
        target_width: w,
        target_height: h,
        output_path: joinPath(directoryPath, buildFileName(shopName, entry)),
        max_bytes: BRAND_STORY_MAX_BYTES,
      })
    );
  }
  return savedPaths;
}
