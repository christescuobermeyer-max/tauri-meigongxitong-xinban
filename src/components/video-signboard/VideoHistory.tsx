import { useEffect, useState } from "react";
import { IconDownload, IconFolder, IconRefresh, IconVideo } from "../Icons";

export interface VideoFileInfo {
  file_name: string;
  file_path: string;
  file_size: number;
  created_at: string;
}

interface Props {
  exportPath: string;
  refreshTrigger?: number;
  onToast?: (message: string, type?: "info" | "success" | "error") => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return fallback;
}

function ensureMp4Path(path: string): string {
  return path.toLowerCase().endsWith(".mp4") ? path : `${path}.mp4`;
}

export default function VideoHistory({ exportPath, refreshTrigger = 0, onToast }: Props) {
  const [videos, setVideos] = useState<VideoFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function loadVideos() {
    if (!exportPath) {
      setVideos([]);
      return;
    }

    setIsLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<VideoFileInfo[]>("list_exported_videos", { exportPath });
      setVideos(result);
    } catch (err) {
      const message = getErrorMessage(err, "加载视频列表失败");
      if (!message.includes("文件夹不存在")) console.warn(message);
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOpenFolder() {
    if (!exportPath) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_export_folder", { exportPath });
    } catch (err) {
      onToast?.(getErrorMessage(err, "打开导出文件夹失败"), "error");
    }
  }

  async function handleDownload(video: VideoFileInfo) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { save } = await import("@tauri-apps/plugin-dialog");
      const savePath = await save({
        defaultPath: video.file_name,
        filters: [{ name: "MP4 视频", extensions: ["mp4"] }],
      });
      if (!savePath) return;
      const mp4SavePath = ensureMp4Path(savePath);
      await invoke("copy_video_file", {
        sourcePath: video.file_path,
        destPath: mp4SavePath,
      });
      onToast?.(`视频已保存到：${mp4SavePath}`, "success");
    } catch (err) {
      onToast?.(getErrorMessage(err, "保存视频失败"), "error");
    }
  }

  useEffect(() => {
    void loadVideos();
  }, [exportPath, refreshTrigger]);

  return (
    <section className="card video-signboard-history">
      <div className="card__header">
        <div className="card__heading">
          <div className="card__title">
            <IconVideo />
            <span>导出视频列表</span>
            <span className="badge" data-tone="info">{videos.length} 个视频</span>
          </div>
          <div className="card__hint">{exportPath || "首次导出时选择保存文件夹"}</div>
        </div>
        <div className="video-signboard-history__actions">
          <button className="btn btn--secondary btn--sm" type="button" onClick={loadVideos} disabled={isLoading}>
            <IconRefresh style={{ width: 13, height: 13 }} />
            {isLoading ? "刷新中" : "刷新"}
          </button>
          <button className="btn btn--secondary btn--sm" type="button" onClick={handleOpenFolder} disabled={!exportPath}>
            <IconFolder style={{ width: 13, height: 13 }} />
            打开文件夹
          </button>
        </div>
      </div>

      <div className="card__body">
        {isLoading ? (
          <div className="video-signboard-history__empty">正在加载导出记录...</div>
        ) : videos.length === 0 ? (
          <div className="video-signboard-history__empty">暂无导出视频</div>
        ) : (
          <div className="video-signboard-history__list">
            <div className="video-signboard-history__row video-signboard-history__row--head">
              <span>名称</span>
              <span>日期</span>
              <span>格式</span>
              <span>大小</span>
              <span />
            </div>
            {videos.map((video) => (
              <button
                key={video.file_path}
                className="video-signboard-history__row"
                type="button"
                onClick={() => handleDownload(video)}
                title="另存该视频"
              >
                <span className="video-signboard-history__name">
                  <IconVideo style={{ width: 14, height: 14 }} />
                  {video.file_name.replace(/\.mp4$/i, "")}
                </span>
                <span>{video.created_at.split(" ")[0]}</span>
                <span>MP4</span>
                <span>{formatFileSize(video.file_size)}</span>
                <IconDownload style={{ width: 14, height: 14 }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
