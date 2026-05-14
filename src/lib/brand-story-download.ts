import { pickDirectoryPath, pickSavePath, resizeAndSaveImage } from "./tauri";
import { safeFileName } from "./utils";
import { BRAND_STORY_EXPORT_SIZE, type BrandStoryImageEntry } from "./brand-story";

function buildFileName(shopName: string, entry: BrandStoryImageEntry): string {
  const { w, h } = BRAND_STORY_EXPORT_SIZE;
  return `${safeFileName(shopName)}_品牌故事_${entry.index}_${entry.name}_${w}x${h}.png`;
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
  return await resizeAndSaveImage({
    base64_data: entry.item.rawBase64,
    target_width: BRAND_STORY_EXPORT_SIZE.w,
    target_height: BRAND_STORY_EXPORT_SIZE.h,
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
    savedPaths.push(
      await resizeAndSaveImage({
        base64_data: entry.item.rawBase64!,
        target_width: BRAND_STORY_EXPORT_SIZE.w,
        target_height: BRAND_STORY_EXPORT_SIZE.h,
        output_path: joinPath(directoryPath, buildFileName(shopName, entry)),
      })
    );
  }
  return savedPaths;
}
