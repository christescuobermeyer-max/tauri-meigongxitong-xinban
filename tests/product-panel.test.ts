import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const productGenerateSource = readFileSync(
  new URL("../src/components/ProductGeneratePanel.tsx", import.meta.url),
  "utf8"
);
const generateSource = readFileSync(
  new URL("../src/components/GeneratePanel.tsx", import.meta.url),
  "utf8"
);
const settingsSource = readFileSync(
  new URL("../src/components/SettingsPanel.tsx", import.meta.url),
  "utf8"
);
const productResultSource = readFileSync(
  new URL("../src/components/ProductResultPanel.tsx", import.meta.url),
  "utf8"
);

equal(productGenerateSource.includes("maxCount={1}"), true);
equal(productGenerateSource.includes("调用系统制作设计图"), true);
equal(productGenerateSource.includes("调用 image-2 制作设计图"), false);
equal(generateSource.includes("用于告诉系统店铺主要卖什么"), true);
equal(generateSource.includes("用于告诉模型店铺主要卖什么"), false);
equal(settingsSource.includes("系统："), true);
equal(settingsSource.includes("gpt-image-2-all"), false);
equal(
  productResultSource.includes("老板，您看下这是为店铺设计的产品图风格"),
  true
);
equal(productResultSource.includes("navigator.clipboard.writeText"), true);
