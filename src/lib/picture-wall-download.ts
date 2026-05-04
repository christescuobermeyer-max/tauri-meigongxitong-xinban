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

export async function downloadPictureWallEntries(
  entries: PictureWallEntry[],
  shopName: string,
  options: DownloadOptions = {}
): Promise<string[] | null> {
  const completed = entries.filter((entry) => entry.item.status === "succeeded" && entry.item.rawBase64);
  if (completed.length === 0) return [];

  const directoryPath = await pickDirectoryPath("选择图片墙下载文件夹");
  if (!directoryPath) return null;

  const savedPaths: string[] = [];
  const stem = safeFileName(shopName);
  const totalCount = completed.length * 2;
  let savedCount = 0;
  const report = (imageIndex: number, fileLabel: string, message: string) => {
    options.onProgress?.({
      savedCount,
      totalCount,
      currentImageIndex: imageIndex,
      totalImages: completed.length,
      currentFileLabel: fileLabel,
      message,
    });
  };

  report(1, "准备下载", `正在下载图片，已下载 0/${totalCount} 个文件`);
  for (const [index, entry] of completed.entries()) {
    const rawBase64 = entry.item.rawBase64!;
    const number = index + 1;
    report(number, "高清原图", `正在下载第 ${number}/${completed.length} 张：高清原图`);
    savedPaths.push(
      await resizeAndSaveImage({
        base64_data: rawBase64,
        target_width: PICTURE_WALL_SOURCE_SIZE.w,
        target_height: PICTURE_WALL_SOURCE_SIZE.h,
        output_path: joinPath(directoryPath, `${stem}_图片墙_${number}_高清原图.png`),
      })
    );
    savedCount += 1;
    report(number, "高清原图", `已下载 ${savedCount}/${totalCount} 个文件`);
    report(number, "240×330", `正在下载第 ${number}/${completed.length} 张：240×330`);
    savedPaths.push(
      await resizeAndSaveImage({
        base64_data: rawBase64,
        target_width: PICTURE_WALL_EXPORT_SIZE.w,
        target_height: PICTURE_WALL_EXPORT_SIZE.h,
        output_path: joinPath(directoryPath, `${stem}_图片墙_${number}_${PICTURE_WALL_EXPORT_SIZE.w}x${PICTURE_WALL_EXPORT_SIZE.h}.png`),
      })
    );
    savedCount += 1;
    report(number, "240×330", `已下载 ${savedCount}/${totalCount} 个文件`);
  }

  report(completed.length, "下载完成", `下载完成，共保存 ${savedCount} 个文件`);
  return savedPaths;
}

function joinPath(directoryPath: string, fileName: string) {
  if (directoryPath.endsWith("\\") || directoryPath.endsWith("/")) return `${directoryPath}${fileName}`;
  return `${directoryPath}\\${fileName}`;
}
