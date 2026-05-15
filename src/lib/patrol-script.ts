import type { GenerationLine } from "../types";

export const PATROL_SCRIPT_EXPORT_SIZE = { w: 1024, h: 1536 } as const;
export const PATROL_SCRIPT_ASSET_KIND = "patrol_script" as const;
export const PATROL_SCRIPT_PLATFORM = "meituan" as const;

export function buildPatrolScriptPrompt(
  storeName: string,
  scriptContent: string
): string {
  const trimmedStore = storeName.trim();
  const trimmedScript = scriptContent.trim();
  return `请为下面这段文字生成一张竖版知识卡片图片平面设计，浅色主题色，垂直杂志风格单页信息图，整体要有吸引力、有视觉冲击力

文字要求：

- 左上角放店铺名：「${trimmedStore}」
- 右下角放：「呈尚策划运营部」
- 主体区域放以下正文，文字必须正确、不乱码、不变形，必须完整呈现，不得改写、删减、增添或翻译：

${trimmedScript}`;
}

export function resolvePatrolScriptSize(line: GenerationLine): string {
  return line === "line4" || line === "line5" ? "16:9" : "1536x1024";
}
