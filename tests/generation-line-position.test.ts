import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  ["../src/components/GeneratePanel.tsx", '<div className="card__title">店铺信息</div>'],
  ["../src/components/ProductGeneratePanel.tsx", '<div className="card__title">制作1张设计图</div>'],
  ["../src/components/ProductBatchGeneratePanel.tsx", '<div className="card__title">制作全店图</div>'],
  ["../src/components/PSignboardPage.tsx", '<div className="card__title">P门头</div>'],
];

for (const [file, titleMarkup] of files) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const cardIndex = source.indexOf("<GenerationLineCard");
  const titleIndex = source.indexOf(titleMarkup);
  const headerControlIndex = source.indexOf('generation-line-control');
  const headerWithControlIndex = source.indexOf("card__header--with-control");

  ok(cardIndex > 0, `${file} 应渲染独立的 GenerationLineCard`);
  ok(titleIndex > 0, `${file} 应包含表单标题：${titleMarkup}`);
  equal(cardIndex < titleIndex, true, `${file} 的生图线路应位于表单标题上方`);
  equal(headerControlIndex, -1, `${file} 不应再使用旧的 generation-line-control`);
  equal(headerWithControlIndex, -1, `${file} 不应再使用旧的 card__header--with-control`);
}

const styles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
const lineCard = readFileSync(new URL("../src/components/GenerationLineCard.tsx", import.meta.url), "utf8");

ok(styles.includes(".panel-stack"), "样式应包含独立板块堆叠容器 .panel-stack");
ok(styles.includes(".generation-line-card"), "样式应包含独立生图线路板块 .generation-line-card");
ok(lineCard.includes("<LineHealthBar />"), "生图线路板块应只保留线路状态条");
equal(lineCard.includes("GenerationLineSelect"), false, "生图线路板块不应再包含手动线路切换器");
equal(lineCard.includes("generation-line-card__notice"), false, "生图线路板块不应再包含线路说明区");
equal(lineCard.includes("generation-line-card__notice-row"), false, "生图线路板块不应再包含线路说明行");
equal(styles.includes("var(--warning)"), false, "线路4不能使用不存在的 --warning 变量");
equal(lineCard.includes("generation-line-card__hint"), false, "生图线路顶部说明应移除");
ok(styles.includes(".generation-line-card::before"), "生图线路板块应有顶部强调条");
ok(styles.includes(".generation-line-card:hover"), "生图线路板块应有更醒目的悬停状态");
