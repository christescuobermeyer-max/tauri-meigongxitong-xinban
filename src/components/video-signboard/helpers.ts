import type { VideoPlatform } from "./types";

export function extractCategoryFromShareText(shareText: string): string {
  const textWithoutUrl = shareText
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/http?:\/\/[^\s]+/g, "");
  const chineseMatch = textWithoutUrl.match(/[\u4e00-\u9fa5]+/g);

  if (chineseMatch && chineseMatch.length > 0) {
    const filtered = chineseMatch.filter(
      (word) =>
        !["复制", "打开", "抖音", "看看", "的作品", "发布了", "一篇", "小红书", "笔记", "快来看吧"].includes(word) &&
        word.length >= 2
    );
    if (filtered.length > 0) {
      const longest = filtered.reduce((a, b) => (a.length >= b.length ? a : b));
      return longest.slice(0, 20);
    }
  }

  return "店招视频";
}

export function detectPlatform(text: string): VideoPlatform | null {
  if (text.includes("xhslink.com") || text.includes("xiaohongshu.com")) return "xiaohongshu";
  if (text.includes("v.douyin.com") || text.includes("douyin.com/video")) return "douyin";
  return null;
}

export function getFileStem(filePath: string): string {
  const baseName = filePath.split(/[/\\]/).pop() || "店招视频";
  const stem = baseName.replace(/\.[^.]+$/, "");
  return stem.trim() || "店招视频";
}

export function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return fallback;
}

export function extractFolderPath(filePath: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  return separatorIndex > 0 ? filePath.slice(0, separatorIndex) : "";
}
