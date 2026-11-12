export type AnimationRatio = "4:3" | "16:9";
export type AnimationFormat = "gif" | "webp";
export const MAX_ANIMATION_BYTES = 5_000_000;
export type AnimationStyleGroup = "premium" | "classic" | "bold";
export const ANIMATION_STYLE_GROUPS: Record<AnimationStyleGroup, string> = { premium: "精致动效", classic: "经典贴纸", bold: "大幅动效" };
export const ANIMATION_STYLES = [
  { id: "gilded", group: "premium", title: "鎏金美味", word: "美味", subtitle: "鲜香浓郁", description: "流光扫过菜品，金色星芒闪烁", color: "#ffd36a", ink: "#7a4a0c" },
  { id: "wok", group: "premium", title: "镬气好吃", word: "好吃到爆", subtitle: "", description: "火星升腾，文字节拍跳动", color: "#ffb52e", ink: "#4a0f05" },
  { id: "crush", group: "premium", title: "心动爱了", word: "爱了爱了", subtitle: "", description: "柔光爱心上浮，文字心跳", color: "#ff7aa5", ink: "#ffffff" },
  { id: "signature", group: "premium", title: "招牌必点", word: "必点", subtitle: "人气招牌", description: "旋转环形徽章，光泽扫过", color: "#f7cf6b", ink: "#9e1610" },
  { id: "sparkle", group: "classic", title: "美味", word: "美味", subtitle: "这一口，绝了", description: "金色星芒闪烁，文字摇摆", color: "#ffe454", ink: "#8d2b0a" },
  { id: "heart", group: "classic", title: "爱了", word: "爱了", subtitle: "好吃到心动", description: "爱心上浮，贴纸心跳缩放", color: "#ff5d83", ink: "#ffffff" },
  { id: "burst", group: "bold", title: "爆香来袭", word: "真香", subtitle: "", description: "贴纸弹性弹出，放射光芒，火花四溅", color: "#ffd25a", ink: "#5a1608" },
  { id: "swing", group: "bold", title: "举牌摇摆", word: "美味", subtitle: "", description: "招牌大幅摇摆，金色星芒闪烁", color: "#f7cf6b", ink: "#8f1209" },
  { id: "blaze", group: "bold", title: "火力全开", word: "好吃到爆", subtitle: "", description: "大字砸落压扁回弹，冲击波与火星", color: "#ffb52e", ink: "#4a0f05" },
  { id: "beat", group: "bold", title: "心动暴击", word: "爱了", subtitle: "", description: "爱心贴纸强力心跳，迸出小爱心", color: "#ff86ad", ink: "#a3083a" },
  { id: "stamp", group: "bold", title: "盖章必点", word: "必点", subtitle: "", description: "印章从天而降，箭头弹跳指向菜品", color: "#ef3b2a", ink: "#fff3e0" },
  { id: "flip", group: "bold", title: "翻牌连击", word: "真香", subtitle: "", description: "真香/好吃/必点三连翻牌，星星迸发", color: "#ffcf48", ink: "#6a2a05" },
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
