import { animationStyleTitle, VIDEO_ANIMATION_STYLE } from "./policy";

interface NamedAnimation { style: string; title?: string | null; sequence?: number | null; createdAt: string; media: { format: string } }

const stamp = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未知时间";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

/** Characters Windows does not allow in file names become "_"; trailing dots and spaces are dropped. */
export const safeName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().replace(/[. ]+$/, "").slice(0, 60);

/**
 * File name for saving an animation:
 * image effects use the uploaded image name (招牌牛肉面.gif), video clips their running number (视频动图_001.gif).
 * Records from before names and numbers existed fall back to style + creation time.
 */
export function animationFileName(result: NamedAnimation) {
  const extension = result.media.format;
  if (result.style === VIDEO_ANIMATION_STYLE) {
    return `视频动图_${result.sequence ? String(result.sequence).padStart(3, "0") : stamp(result.createdAt)}.${extension}`;
  }
  const title = safeName(result.title ?? "");
  return `${title || `菜品_${animationStyleTitle(result.style)}_${stamp(result.createdAt)}`}.${extension}`;
}

/** Makes names unique within one batch: a.gif, a (2).gif, a (3).gif… */
export function uniqueFileNames(names: string[]) {
  const used = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf(".");
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
