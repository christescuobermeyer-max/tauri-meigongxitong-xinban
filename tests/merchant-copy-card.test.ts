import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const copyCardSource = readFileSync(
  new URL("../src/components/MerchantCopyCard.tsx", import.meta.url),
  "utf8"
);
const pictureWallResultsSource = readFileSync(
  new URL("../src/components/PictureWallResults.tsx", import.meta.url),
  "utf8"
);
const resultPanelSource = readFileSync(
  new URL("../src/components/ResultPanel.tsx", import.meta.url),
  "utf8"
);
const productBatchResultSource = readFileSync(
  new URL("../src/components/ProductBatchResultPanel.tsx", import.meta.url),
  "utf8"
);
const productResultSource = readFileSync(
  new URL("../src/components/ProductResultPanel.tsx", import.meta.url),
  "utf8"
);
const detailPageResultSource = readFileSync(
  new URL("../src/components/DetailPageResults.tsx", import.meta.url),
  "utf8"
);

equal(copyCardSource.includes("navigator.clipboard.writeText"), true);
equal(copyCardSource.includes("useToast"), true);
equal(copyCardSource.includes("data-copy-state"), true);
equal(copyCardSource.includes("商家沟通文案"), true);

equal(
  pictureWallResultsSource.includes("我们为店铺上线了专业设计的图片墙"),
  true
);
equal(
  pictureWallResultsSource.includes("点击率平均提升32%"),
  true
);
equal(pictureWallResultsSource.includes("MerchantCopyCard"), true);

equal(
  resultPanelSource.includes("老板您好，您的大店招、海报和头像设计已经完成"),
  true
);
equal(
  resultPanelSource.includes("提高您店铺的曝光度和入店转化率"),
  true
);
equal(resultPanelSource.includes("MerchantCopyCard"), true);

equal(
  productBatchResultSource.includes("老板,您店铺的10张全店图我们已经做好"),
  true
);
equal(
  productBatchResultSource.includes("点击率能提升30%以上"),
  true
);
equal(productBatchResultSource.includes("MerchantCopyCard"), true);

equal(
  productResultSource.includes("老板，您看下这是为店铺设计的产品图风格"),
  true
);
equal(
  productResultSource.includes("老板，我们分析了您店铺的销售数据"),
  false
);
equal(productResultSource.includes("MerchantCopyCard"), true);

equal(
  detailPageResultSource.includes("老板，我们分析了您店铺的销售数据"),
  true
);
equal(
  detailPageResultSource.includes("下单的概率能提升20%-30%"),
  true
);
equal(
  detailPageResultSource.includes('美团现在有个"优质商品"的标签认证'),
  true
);
equal(detailPageResultSource.includes("MerchantCopyCard"), true);
