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
  // 店铺名在 prompt 里反复出现 4 次 + 第一句强调，避免上游 AI 在 storeName 微小变化时
  // 复用上一次的潜在表示（latent reuse）。否则两次请求只差 4 个字，模型容易当成同一请求。
  return `请为店铺「${trimmedStore}」生成一张竖版知识卡片图片平面设计，浅色主题色，垂直杂志风格单页信息图，整体要有吸引力、有视觉冲击力。

【店铺名】：${trimmedStore}（这是图片必须呈现的核心信息）

文字要求：

- 左上角醒目位置必须写店铺名：「${trimmedStore}」
- 右下角放：「呈尚策划运营部」
- 主体区域放以下正文，文字必须正确、不乱码、不变形，必须完整呈现，不得改写、删减、增添或翻译：

${trimmedScript}

再次提醒：左上角的店铺名必须是「${trimmedStore}」，请勿混淆或省略，店铺名是本次生成的关键标识。`;
}

export function resolvePatrolScriptSize(_line: GenerationLine): string {
  return "1024x1536";
}
