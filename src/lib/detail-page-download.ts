import { DETAIL_PAGE_EXPORT_SIZE, type DetailPageEntry } from "./detail-page";
import { pickDirectoryPath, pickSavePath, resizeAndSaveImage } from "./tauri";
import { safeFileName } from "./utils";

export async function downloadDetailPageEntry(
  entry: DetailPageEntry,
  shopName: string
): Promise<string | null> {
  if (entry.item.status !== "succeeded" || !entry.item.rawBase64) return null;
  const fileName = buildDetailPageFileName(shopName, entry.pageIndex);
  const selectedPath = await pickSavePath(fileName);
  if (!selectedPath) return null;
  return await resizeAndSaveImage({
    base64_data: entry.item.rawBase64,
    target_width: DETAIL_PAGE_EXPORT_SIZE.w,
    target_height: DETAIL_PAGE_EXPORT_SIZE.h,
    output_path: selectedPath,
  });
}

export async function downloadDetailPageEntries(
  entries: DetailPageEntry[],
  shopName: string
): Promise<string[] | null> {
  const completed = entries.filter((entry) => entry.item.status === "succeeded" && entry.item.rawBase64);
  if (completed.length === 0) return [];

  const directoryPath = await pickDirectoryPath("选择详情页下载文件夹");
  if (!directoryPath) return null;

  const stem = safeFileName(shopName);
  const savedPaths: string[] = [];
  for (const entry of completed) {
    savedPaths.push(
      await resizeAndSaveImage({
        base64_data: entry.item.rawBase64!,
        target_width: DETAIL_PAGE_EXPORT_SIZE.w,
        target_height: DETAIL_PAGE_EXPORT_SIZE.h,
        output_path: joinPath(directoryPath, buildDetailPageFileName(stem, entry.pageIndex)),
      })
    );
  }
  return savedPaths;
}

function buildDetailPageFileName(shopName: string, pageIndex: number) {
  return `${safeFileName(shopName)}_详情页_${pageIndex + 1}_${DETAIL_PAGE_EXPORT_SIZE.w}x${DETAIL_PAGE_EXPORT_SIZE.h}.png`;
}

function joinPath(directoryPath: string, fileName: string) {
  if (directoryPath.endsWith("\\") || directoryPath.endsWith("/")) return `${directoryPath}${fileName}`;
  return `${directoryPath}\\${fileName}`;
}
