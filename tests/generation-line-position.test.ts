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
ok(lineCard.includes("线路1为yunwu 接口，线路2为 pockgo 接口"), "生图线路标题下方应提示 yunwu/pockgo 接口");
ok(lineSelect.includes('hint: "yunwu"'), "线路1选择器副标题应显示 yunwu");
equal(lineSelect.includes('hint: "默认"'), false, "线路1选择器不应再显示默认");
ok(lineCard.includes("线路1（王郡江 杨有淇 王涛）使用"), "生图线路下方应提示线路1使用人员");
ok(lineCard.includes("线路2（王清月 袁丽妮 黄兆微）使用"), "生图线路下方应提示线路2使用人员");
ok(noticeIndex > selectIndex, "人员使用说明应放在选择器下方的独立提示区域");
ok(styles.includes(".generation-line-card__notice"), "样式应包含生图线路底部提示区域");
ok(styles.includes(".generation-line-card::before"), "生图线路板块应有顶部强调条");
ok(styles.includes(".generation-line-card:hover"), "生图线路板块应有更醒目的悬停状态");
ok(styles.includes(".generation-line-card .segmented"), "生图线路选择器应在该板块内单独强化展示");
