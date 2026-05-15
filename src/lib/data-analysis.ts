import type { GenerationLine } from "../types";

export const DATA_ANALYSIS_EXPORT_SIZE = { w: 1536, h: 1024 } as const;
export const DATA_ANALYSIS_ASSET_KIND = "data_analysis" as const;
export const DATA_ANALYSIS_PLATFORM = "meituan" as const;

export const DATA_ANALYSIS_COPY_TEXT =
  "老板，我们看了您店铺这30天的数据，整体走势是符合预期的。现在这个阶段其实是在给店铺打地基，平台算法需要一段时间来重新识别您店铺的品类定位和用户画像，这个过程中权重在慢慢积累。从数据曲线上看，虽然现在单量和曝光还没有明显爆发，但基础指标已经在往好的方向走了，店铺的搜索权重和推荐权重都在稳步提升。外卖运营就是这样，前期要把地基打牢，后面才能稳定增长。根据我们的经验和您店铺目前的数据表现，接下来会开始进入一个阶梯式递增的阶段，单量和曝光都会逐步往上走。我们会继续盯着数据，配合这个上升趋势做好优化调整。";

export function buildDataAnalysisPrompt(storeName: string): string {
  const trimmed = storeName.trim();
  return `请仔细读取用户上传的外卖店铺30天流量数据截图，店铺名称是「${trimmed}」。

请生成一张专业的数据分析可视化图片，横版 3:2 或 16:9 构图，画面适合发送给外卖商家沟通运营效果。

内容要求：
1. 标题必须使用店铺名称「${trimmed}」和“30天流量数据分析”。
2. 根据截图中能识别到的真实数据，整理曝光人数、进店人数、下单人数、转化率、趋势变化等核心指标。
3. 用专业商务图表表达数据，包括漏斗图、趋势折线、关键指标卡片和简短结论。
4. 如果截图里某个数字无法清晰识别，请用趋势性描述替代，不要虚构截图中不存在的具体数值。
5. 结论要偏运营沟通场景，强调权重积累、流量基础、后续增长空间。

视觉要求：
- 高级数据看板风格，白色或浅色背景，蓝色、橙色、绿色作为辅助色。
- 信息层级清楚，文字必须可读，不要堆叠过多小字。
- 图片整体要像一张可直接发给商家的专业数据分析图。`;
}

export function resolveDataAnalysisSize(line: GenerationLine): string {
  return line === "line4" || line === "line5" ? "16:9" : "1536x1024";
}
