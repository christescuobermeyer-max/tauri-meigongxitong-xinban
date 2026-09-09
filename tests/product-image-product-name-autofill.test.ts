import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/hooks/useProductImageWorkspace.ts", import.meta.url),
  "utf8",
);

// productName 自动填充逻辑必须满足：
// 1. 跟踪"上一次自动填入的值" autoFilledProductName
// 2. 当 images 变化且 images[0].productName 与上次自动填入值一致时（即用户没改过）允许覆盖
// 3. 用户手动改过后不再覆盖

ok(
  source.includes("autoFilledProductName"),
  "useProductImageWorkspace 必须跟踪 autoFilledProductName，否则换图后无法识别用户是否改过名字",
);
ok(
  source.includes("setAutoFilledProductName"),
  "useProductImageWorkspace 必须在自动填充时同步更新 autoFilledProductName",
);

// 关键判定：「!current」 OR 「current === autoFilledProductName」 才允许覆盖
ok(
  /current\s*===\s*autoFilledProductName/.test(source),
  "useProductImageWorkspace 自动填充时必须判断当前值是否仍是上次自动填入的（区分用户是否改过）",
);

// 旧实现是 `if (productName.trim()) return;`，它会让"换图不更新"，必须已被移除
ok(
  !/if\s*\(\s*productName\.trim\(\)\s*\)\s*return\s*;/.test(source),
  "useProductImageWorkspace 不应再做 `if (productName.trim()) return` 的早返回 — 那会阻止换图时刷新菜品名",
);

// 副作用应只依赖 images，避免用户敲键时回卷
const effectBlock = source.match(/useEffect\(\(\)\s*=>\s*{[\s\S]*?},\s*\[[^\]]*\]\);/);
ok(effectBlock, "未找到 productName 自动填充的 useEffect");
ok(
  /\[\s*images\s*\]/.test(effectBlock?.[0] ?? ""),
  "productName 自动填充的 useEffect 应只依赖 [images]，不要把 productName 放进依赖（会回卷）",
);

ok(
  source.includes('ProductImageProductNameMode = "with" | "without"'),
  "制作1张设计图应支持带产品名称 / 不带产品名称两种模式",
);
ok(
  source.includes('productNameMode === "with" && !productName.trim()'),
  "只有带产品名称模式才应强制填写产品名称",
);
ok(
  source.includes("includeProductName"),
  "制作1张设计图生成时应把产品名称模式传入 prompt",
);
ok(
  source.includes("productNameForGeneration"),
  "不带产品名称模式下传给生成流程的产品名称应为空",
);
ok(
  source.includes("promptOverride: buildProductPrompt"),
  "制作1张设计图应显式构造 prompt，确保不带产品名称模式不会写入产品名",
);

console.log("product-image productName autofill contract: OK");
