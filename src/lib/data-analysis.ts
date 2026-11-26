import type { GenerationLine } from "../types";

export const DATA_ANALYSIS_EXPORT_SIZE = { w: 1536, h: 1024 } as const;
export const DATA_ANALYSIS_ASSET_KIND = "data_analysis" as const;
export const DATA_ANALYSIS_PLATFORM = "meituan" as const;

export const DATA_ANALYSIS_COPY_TEXT =
  "老板，我们看了您店铺这30天的数据，整体走势是符合预期的。现在这个阶段其实是在给店铺打地基，平台算法需要一段时间来重新识别您店铺的品类定位和用户画像，这个过程中权重在慢慢积累。从数据曲线上看，虽然现在单量和曝光还没有明显爆发，但基础指标已经在往好的方向走了，店铺的搜索权重和推荐权重都在稳步提升。外卖运营就是这样，前期要把地基打牢，后面才能稳定增长。根据我们的经验和您店铺目前的数据表现，接下来会开始进入一个阶梯式递增的阶段，单量和曝光都会逐步往上走。我们会继续盯着数据，配合这个上升趋势做好优化调整。";

// 截图只交给网关视觉模型读数（/api/data-analysis-extract），生图请求不再携带截图：
// 截图送进 image edits 接口时，上游有一半以上概率原样返回截图。
export function buildDataAnalysisPrompt(storeName: string, metrics: string): string {
  const trimmed = storeName.trim();
  return `请为外卖店铺「${trimmed}」生成一张专业的数据分析可视化图片，横版 3:2 构图，画面适合发送给外卖商家沟通运营效果。

以下是从店铺数据截图中识别出的已核实数据（只能使用这些数字，不得编造其他具体数值）：
${metrics.trim()}

内容要求：
1. 标题必须使用店铺名称「${trimmed}」和“30天流量数据分析”。
2. 数据包含曝光、入店、下单人数时，用漏斗图展示曝光人数 → 入店人数 → 下单人数，并标注入店转化率、下单转化率；其他指标用关键指标卡片或柱状图表达。
3. 带“人”的数据是人数，带“次”的数据是次数；次数只能作为辅助说明，不能当作人数。
4. 只有上面给出了逐日或分时段数值时才画趋势折线，不得虚构每天的数据。
5. 加一段简短结论，偏运营沟通场景，强调权重积累、流量基础、后续增长空间。

视觉要求：
- 高级数据看板风格，白色或浅色背景，蓝色、橙色、绿色作为辅助色。
- 信息层级清楚，中文文字清晰可读，图中数字必须与上面的数据完全一致，不要堆叠过多小字。
- 图片整体要像一张可直接发给商家的专业数据分析图。`;
}

export function resolveDataAnalysisSize(line: GenerationLine): string {
  return line === "line5" ? "16:9" : "1536x1024";
}
