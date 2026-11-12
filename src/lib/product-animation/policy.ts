export type AnimationRatio = "4:3" | "16:9";
export type AnimationFormat = "gif" | "webp";
export const MAX_ANIMATION_BYTES = 5_000_000;
export type AnimationStyleGroup = "ai" | "premium" | "classic";
export const ANIMATION_STYLE_GROUPS: Record<AnimationStyleGroup, string> = { ai: "AI 生成", premium: "精致动效", classic: "经典贴纸" };
export const ANIMATION_STYLES = [
  { id: "steam", group: "ai", title: "热气腾腾", word: "", subtitle: "", description: "自然热气与菜品细微动态，无贴纸", color: "#fff0c3", ink: "#a62817" },
  { id: "smoke", group: "premium", title: "烟火真香", word: "真香", subtitle: "一口入魂", description: "团状热气升腾，毛笔字配朱砂印章", color: "#fff1d6", ink: "#c8261c" },
  { id: "gilded", group: "premium", title: "鎏金美味", word: "美味", subtitle: "鲜香浓郁", description: "流光扫过菜品，金色星芒闪烁", color: "#ffd36a", ink: "#7a4a0c" },
  { id: "wok", group: "premium", title: "镬气好吃", word: "好吃到爆", subtitle: "", description: "火星升腾，文字节拍跳动", color: "#ffb52e", ink: "#4a0f05" },
  { id: "crush", group: "premium", title: "心动爱了", word: "爱了爱了", subtitle: "", description: "柔光爱心上浮，文字心跳", color: "#ff7aa5", ink: "#ffffff" },
  { id: "signature", group: "premium", title: "招牌必点", word: "必点", subtitle: "人气招牌", description: "旋转环形徽章，光泽扫过", color: "#f7cf6b", ink: "#9e1610" },
  { id: "aroma", group: "classic", title: "真香", word: "真香", subtitle: "香气扑面而来", description: "真香贴纸跳动，热气升腾", color: "#fff0c3", ink: "#a62817" },
  { id: "sparkle", group: "classic", title: "美味", word: "美味", subtitle: "这一口，绝了", description: "金色星芒闪烁，文字摇摆", color: "#ffe454", ink: "#8d2b0a" },
  { id: "flame", group: "classic", title: "好吃", word: "好吃", subtitle: "越吃越过瘾", description: "火焰跃动，文字弹跳", color: "#f34226", ink: "#fff6d4" },
  { id: "heart", group: "classic", title: "爱了", word: "爱了", subtitle: "好吃到心动", description: "爱心上浮，贴纸心跳缩放", color: "#ff5d83", ink: "#ffffff" },
  { id: "recommend", group: "classic", title: "必点", word: "必点", subtitle: "招牌推荐", description: "推荐章摇摆，箭头指向菜品", color: "#ffcf48", ink: "#762414" },
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
