import {
  PICTURE_WALL_EXPORT_SIZE,
  PICTURE_WALL_SOURCE_SIZE,
  type PictureWallEntry,
} from "./picture-wall";
import { pickDirectoryPath, resizeAndSaveImage } from "./tauri";
import { safeFileName } from "./utils";

export interface PictureWallDownloadProgress {
  savedCount: number;
  totalCount: number;
  currentImageIndex: number;
  totalImages: number;
  currentFileLabel: string;
  message: string;
}

interface DownloadOptions {
  onProgress?: (progress: PictureWallDownloadProgress) => void;
}

const EXPORT_LABEL = `${PICTURE_WALL_EXPORT_SIZE.w}×${PICTURE_WALL_EXPORT_SIZE.h}`;

export async function downloadPictureWallEntries(
  entries: PictureWallEntry[],
  shopName: string,
  options: DownloadOptions = {}
): Promise<string[] | null> {
  const completed = entries.filter((entry) => entry.item.status === "succeeded" && entry.item.rawBase64);
  if (completed.length === 0) return [];

  const directoryPath = await pickDirectoryPath("选择图片墙下载文件夹");
  if (!directoryPath) return null;

  const totalCount = completed.length * 2;
  const savedPaths: string[] = [];
  const stem = safeFileName(shopName);
  const report = (currentImageIndex: number, fileLabel: string, message: string) => {
    options.onProgress?.({
      savedCount: savedPaths.length,
      totalCount,
      currentImageIndex,
      totalImages: completed.length,
      currentFileLabel: fileLabel,
      message,
    });
  };

  report(1, "准备下载", `正在下载图片，已下载 0/${totalCount} 个文件`);
  for (const [index, entry] of completed.entries()) {
    const number = index + 1;
    await saveEntryPair(entry, stem, directoryPath, number, savedPaths, totalCount, report);
  }
  report(completed.length, "下载完成", `下载完成，共保存 ${savedPaths.length} 个文件`);
  return savedPaths;
}

export async function downloadSinglePictureWallEntry(
  entry: PictureWallEntry,
  shopName: string,
  numberInGrid: number,
  options: DownloadOptions = {}
): Promise<string[] | null> {
  if (entry.item.status !== "succeeded" || !entry.item.rawBase64) return [];

  const directoryPath = await pickDirectoryPath(`选择图片墙第 ${numberInGrid} 张下载文件夹`);
  if (!directoryPath) return null;

  const totalCount = 2;
  const savedPaths: string[] = [];
  const stem = safeFileName(shopName);
  const report = (fileLabel: string, message: string) => {
    options.onProgress?.({
      savedCount: savedPaths.length,
      totalCount,
      currentImageIndex: numberInGrid,
      totalImages: 1,
      currentFileLabel: fileLabel,
      message,
    });
  };

  report("准备下载", `正在下载第 ${numberInGrid} 张图片，已下载 0/${totalCount} 个文件`);
  await saveEntryPair(entry, stem, directoryPath, numberInGrid, savedPaths, totalCount, (_index, fileLabel, message) =>
    report(fileLabel, message)
  );
  report("下载完成", `下载完成，共保存 ${savedPaths.length} 个文件`);
  return savedPaths;
}

async function saveEntryPair(
  entry: PictureWallEntry,
  stem: string,
  directoryPath: string,
  numberInGrid: number,
  savedPaths: string[],
  totalCount: number,
  report: (currentImageIndex: number, fileLabel: string, message: string) => void
): Promise<void> {
  const rawBase64 = entry.item.rawBase64!;

  report(numberInGrid, "高清原图", `正在下载第 ${numberInGrid} 张：高清原图`);
  savedPaths.push(
    await resizeAndSaveImage({
      base64_data: rawBase64,
      target_width: PICTURE_WALL_SOURCE_SIZE.w,
      target_height: PICTURE_WALL_SOURCE_SIZE.h,
      output_path: joinPath(directoryPath, `${stem}_图片墙_${numberInGrid}_高清原图.png`),
    })
  );
  report(numberInGrid, "高清原图", `已下载 ${savedPaths.length}/${totalCount} 个文件`);

  report(numberInGrid, EXPORT_LABEL, `正在下载第 ${numberInGrid} 张：${EXPORT_LABEL}`);
  savedPaths.push(
    await resizeAndSaveImage({
      base64_data: rawBase64,
      target_width: PICTURE_WALL_EXPORT_SIZE.w,
      target_height: PICTURE_WALL_EXPORT_SIZE.h,
      output_path: joinPath(
        directoryPath,
        `${stem}_图片墙_${numberInGrid}_${PICTURE_WALL_EXPORT_SIZE.w}x${PICTURE_WALL_EXPORT_SIZE.h}.png`
      ),
    })
  );
  report(numberInGrid, EXPORT_LABEL, `已下载 ${savedPaths.length}/${totalCount} 个文件`);
}

function joinPath(directoryPath: string, fileName: string) {
  if (directoryPath.endsWith("\\") || directoryPath.endsWith("/")) return `${directoryPath}${fileName}`;
  return `${directoryPath}\\${fileName}`;
}
