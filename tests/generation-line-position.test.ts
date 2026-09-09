import { equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const files = [
  ["../src/components/GeneratePanel.tsx", '<div className="card__title">店铺信息</div>'],
  ["../src/components/ProductGeneratePanel.tsx", '<div className="card__title">制作1张设计图</div>'],
  ["../src/components/ProductBatchGeneratePanel.tsx", '<div className="card__title">制作全店图</div>'],
  ["../src/components/PSignboardPage.tsx", '<div className="card__title">P门头</div>'],
];

for (const [file, titleMarkup] of files) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const titleIndex = source.indexOf(titleMarkup);

  ok(titleIndex > 0, `${file} 应包含表单标题：${titleMarkup}`);
  equal(source.includes("GenerationLineCard"), false, `${file} 不应再渲染线路状态组件框`);
  equal(source.includes("LineHealthBar"), false, `${file} 不应再渲染线路健康条`);
  equal(source.includes("generation-line-control"), false, `${file} 不应再使用旧的 generation-line-control`);
  equal(source.includes("card__header--with-control"), false, `${file} 不应再使用旧的 card__header--with-control`);
}

const styles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

ok(styles.includes(".panel-stack"), "样式应保留独立板块堆叠容器 .panel-stack");
equal(existsSync(new URL("../src/components/GenerationLineCard.tsx", import.meta.url)), false, "线路状态组件框文件应移除");
equal(existsSync(new URL("../src/components/LineHealthBar.tsx", import.meta.url)), false, "线路健康条组件文件应移除");
equal(styles.includes(".generation-line-card"), false, "线路状态组件框样式应移除");
equal(styles.includes(".line-health-bar"), false, "线路健康条样式应移除");
equal(styles.includes("var(--warning)"), false, "线路4不能使用不存在的 --warning 变量");
