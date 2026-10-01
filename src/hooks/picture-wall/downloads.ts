import type { Dispatch, SetStateAction } from "react";
import { downloadPictureWallEntries, downloadSinglePictureWallEntry, type PictureWallDownloadProgress } from "../../lib/picture-wall-download";
import type { PictureWallEntry } from "../../lib/picture-wall";

type DownloadStatus = (PictureWallDownloadProgress & { active: boolean }) | null;
interface Context {
  entries: PictureWallEntry[];
  shopName: string;
  completedCount: number;
  setDownloadStatus: Dispatch<SetStateAction<DownloadStatus>>;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
}

export function createPictureWallDownloads({ entries, shopName, completedCount, setDownloadStatus, onToast }: Context) {
  async function handleDownload() {
    try {
      setDownloadStatus({
        active: true,
        savedCount: 0,
        totalCount: completedCount * 2,
        currentImageIndex: 0,
        totalImages: completedCount,
        currentFileLabel: "选择文件夹",
        message: "请选择图片墙下载文件夹",
      });
      const saved = await downloadPictureWallEntries(entries, shopName, {
        onProgress: (progress) => setDownloadStatus({ ...progress, active: true }),
      });
      if (!saved || saved.length === 0) {
        setDownloadStatus(null);
        return;
      }
      setDownloadStatus((previous) =>
        previous ? { ...previous, active: false, message: `下载完成，共保存 ${saved.length} 个文件` } : null
      );
      onToast(`图片下载完成，已保存 ${saved.length} 个文件`, "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setDownloadStatus((previous) =>
        previous ? { ...previous, active: false, message: `下载失败：${message}` } : null
      );
      onToast(`下载失败：${message}`, "error");
    }
  }

  async function handleDownloadSingle(sourceImageId: string) {
    const index = entries.findIndex((entry) => entry.sourceImageId === sourceImageId);
    if (index < 0) return;
    const entry = entries[index];
    if (entry.item.status !== "succeeded" || !entry.item.rawBase64) {
      onToast("该图片暂未生成完成，无法下载", "error");
      return;
    }
    const number = index + 1;
    try {
      setDownloadStatus({
        active: true,
        savedCount: 0,
        totalCount: 2,
        currentImageIndex: number,
        totalImages: 1,
        currentFileLabel: "选择文件夹",
        message: `请选择第 ${number} 张图片的下载文件夹`,
      });
      const saved = await downloadSinglePictureWallEntry(entry, shopName, number, {
        onProgress: (progress) => setDownloadStatus({ ...progress, active: true }),
      });
      if (!saved || saved.length === 0) {
        setDownloadStatus(null);
        return;
      }
      setDownloadStatus((previous) =>
        previous ? { ...previous, active: false, message: `第 ${number} 张已下载，共保存 ${saved.length} 个文件` } : null
      );
      onToast(`第 ${number} 张已下载，已保存 ${saved.length} 个文件`, "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setDownloadStatus((previous) =>
        previous ? { ...previous, active: false, message: `下载失败：${message}` } : null
      );
      onToast(`下载失败：${message}`, "error");
    }
  }

  return { handleDownload, handleDownloadSingle };
}
