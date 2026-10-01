export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

export type VideoPlatform = "xiaohongshu" | "douyin";
export type VideoExportTarget = "meituan" | "taobaoFlash";

export interface VideoInfo {
  videoUrl: string;
  title: string;
  author: string;
  platform: VideoPlatform;
  headers?: Record<string, string>;
}

export type VideoSource =
  | { type: "remote"; info: VideoInfo }
  | { type: "local"; filePath: string; displayName: string };
