export type AnimationRatio = "4:3" | "16:9";
export type AnimationFormat = "gif" | "webp";
export const MAX_ANIMATION_BYTES = 5_000_000;
export const ANIMATION_STYLES = [
  { id: "steam", title: "热气腾腾", word: "", subtitle: "", description: "自然热气与菜品细微动态，无贴纸", color: "#fff0c3", ink: "#a62817" },
  { id: "aroma", title: "真香", word: "真香", subtitle: "香气扑面而来", description: "真香贴纸跳动，热气升腾", color: "#fff0c3", ink: "#a62817" },
  { id: "sparkle", title: "美味", word: "美味", subtitle: "这一口，绝了", description: "金色星芒闪烁，文字摇摆", color: "#ffe454", ink: "#8d2b0a" },
  { id: "flame", title: "好吃", word: "好吃", subtitle: "越吃越过瘾", description: "火焰跃动，文字弹跳", color: "#f34226", ink: "#fff6d4" },
  { id: "heart", title: "爱了", word: "爱了", subtitle: "好吃到心动", description: "爱心上浮，贴纸心跳缩放", color: "#ff5d83", ink: "#ffffff" },
  { id: "recommend", title: "必点", word: "必点", subtitle: "招牌推荐", description: "推荐章摇摆，箭头指向菜品", color: "#ffcf48", ink: "#762414" },
] as const;
export type AnimationStyle = typeof ANIMATION_STYLES[number]["id"];

function validDimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
}

export function chooseAnimationSize(width: number, height: number, ratio: AnimationRatio) {
  if (!validDimensions(width, height)) throw new Error("无法识别原图尺寸");
  const divisor = ratio === "4:3" ? 4 : 16;
  const multiplier = ratio === "4:3" ? 3 : 9;
  const minimumHeight = ratio === "4:3" ? 562 : 422;
  if (width * multiplier === height * divisor && width > 750 && height > minimumHeight && width <= 2048 && height <= 1536) {
    return { width, height, adjusted: false };
  }
  return { width: 1024, height: ratio === "4:3" ? 768 : 576, adjusted: true };
}

export function containImage(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  if (!validDimensions(sourceWidth, sourceHeight) || !validDimensions(width, height)) throw new Error("图片尺寸无效");
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return { x: (width - sourceWidth * scale) / 2, y: (height - sourceHeight * scale) / 2, width: sourceWidth * scale, height: sourceHeight * scale };
}

export function validateAnimation(media: { width: number; height: number; durationMs: number; bytes: number; frames: number; format: string }) {
  const errors: string[] = [];
  const ratio43 = media.width * 3 === media.height * 4;
  const ratio169 = media.width * 9 === media.height * 16;
  if (!validDimensions(media.width, media.height) || (!ratio43 && !ratio169)) errors.push("仅支持精确 4:3 或 16:9");
  if (!(media.width > 750 && media.height > (ratio43 ? 562 : 422))) errors.push("分辨率未达到平台要求");
  if (!(media.durationMs >= 2000 && media.durationMs <= 5000)) errors.push("时长必须为 2–5 秒");
  if (!(media.bytes > 0 && media.bytes <= MAX_ANIMATION_BYTES)) errors.push("文件必须不超过 5,000,000 字节");
  if (!(Number.isInteger(media.frames) && media.frames >= 2)) errors.push("必须为多帧动图");
  if (media.format !== "gif" && media.format !== "webp") errors.push("仅支持 GIF 或 WebP");
  return errors;
}
