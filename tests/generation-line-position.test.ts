import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  ["../src/components/GeneratePanel.tsx", "店铺信息"],
  ["../src/components/ProductGeneratePanel.tsx", "制作1张设计图"],
  ["../src/components/ProductBatchGeneratePanel.tsx", "制作全店图"],
  ["../src/components/PSignboardPage.tsx", "P门头"],
];

for (const [file, title] of files) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const cardIndex = source.indexOf("<GenerationLineCard");
  const titleIndex = source.indexOf(title);
  const headerControlIndex = source.indexOf('generation-line-control');
  const headerWithControlIndex = source.indexOf("card__header--with-control");

  ok(cardIndex > 0, `${file} 应渲染独立的 GenerationLineCard`);
  ok(titleIndex > 0, `${file} 应包含表单标题：${title}`);
  equal(cardIndex < titleIndex, true, `${file} 的生图线路应位于 ${title} 上方`);
  equal(headerControlIndex, -1, `${file} 不应再使用旧的 generation-line-control`);
  equal(headerWithControlIndex, -1, `${file} 不应再使用旧的 card__header--with-control`);
}

const styles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
const lineCard = readFileSync(new URL("../src/components/GenerationLineCard.tsx", import.meta.url), "utf8");
const lineSelect = readFileSync(new URL("../src/components/GenerationLineSelect.tsx", import.meta.url), "utf8");
const selectIndex = lineCard.indexOf("<GenerationLineSelect");
const noticeIndex = lineCard.indexOf("generation-line-card__notice");

ok(styles.includes(".panel-stack"), "样式应包含独立板块堆叠容器 .panel-stack");
ok(styles.includes(".generation-line-card"), "样式应包含独立生图线路板块 .generation-line-card");
ok(
  styles.includes('.generation-line-card__notice-row[data-line="line4"] .generation-line-card__notice-label'),
  "线路4文案自身应有独立背景框样式"
);
ok(
  styles.includes("background: color-mix(in srgb, var(--warn) 12%, var(--bg-subtle));"),
  "线路4文案背景框应使用有效的 warn 色值"
);
equal(styles.includes("var(--warning)"), false, "线路4不能使用不存在的 --warning 变量");
equal(lineSelect.includes("segmented__meta"), false, "线路切换按钮不应再显示引擎副标题");
equal(lineCard.includes("generation-line-card__hint"), false, "生图线路顶部说明应移除");
ok(lineCard.includes("generation-line-card__notice-engine"), "生图线路底部应显示引擎名标签");
ok(lineCard.includes("yunwu"), "线路1说明应保留 yunwu");
ok(lineCard.includes('<div className="generation-line-card__notice-row" data-line="line2">'), "线路2应保留独立展示行");
ok(lineCard.includes("王清月 袁丽妮 黄兆微 使用"), "线路2应展示原线路2人员");
ok(lineCard.includes("pockgo"), "线路4说明应保留 pockgo");
ok(lineCard.includes("vectorengine"), "线路3说明应保留 vectorengine");
ok(lineCard.includes("金牌线路"), "线路5应显示为金牌线路");
ok(styles.includes("--line5-gold"), "线路5应使用独立金牌主题色变量");
ok(styles.includes('.generation-line-card__notice-row[data-line="line5"]'), "线路5应有独立视觉样式");
ok(styles.includes('.generation-line-card .segmented__item[data-line="line5"][data-active="true"]'), "线路5选中按钮应有独立金牌样式");
equal(
  lineCard.includes('data-line="line5">\n          <span className="generation-line-card__notice-label">线路5</span>\n          <span className="generation-line-card__notice-engine">APIMart</span>\n          <span className="generation-line-card__notice-text">备用线路</span>'),
  false,
  "线路5不应再显示备用线路"
);
ok(lineCard.includes("generation-line-card__notice-row"), "线路说明应拆成五行独立提示");
ok(noticeIndex > selectIndex, "人员使用说明应放在选择器下方的独立提示区域");
ok(styles.includes(".generation-line-card__notice"), "样式应包含生图线路底部提示区域");
ok(styles.includes(".generation-line-card__notice-row"), "样式应包含线路说明单行排版");
ok(styles.includes("grid-template-columns: 54px 92px minmax(0, 1fr);"), "线路说明应按线路标签、引擎名、用途三列对齐");
ok(styles.includes(".generation-line-card__notice-engine"), "样式应包含引擎名标签");
ok(styles.includes("grid-template-columns: repeat(5, minmax(0, 1fr));"), "线路切换按钮应改为五列网格");
ok(styles.includes(".generation-line-card::before"), "生图线路板块应有顶部强调条");
ok(styles.includes(".generation-line-card:hover"), "生图线路板块应有更醒目的悬停状态");
ok(styles.includes(".generation-line-card .segmented"), "生图线路选择器应在该板块内单独强化展示");
