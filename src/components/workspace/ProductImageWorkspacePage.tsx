import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import ProductGeneratePanel from "../ProductGeneratePanel";
import ProductResultPanel from "../ProductResultPanel";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["productImageSlots"];
  elapsed: number;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function ProductImageWorkspacePage({ slots, elapsed }: Props) {
  const [active, setActive] = useState(0);
  const pi = slots[active];
  const tabs = slots.map((slot, index) => ({
    label: TAB_LABELS[index],
    shopName: slot.shopName.trim(),
    busy: slot.busy,
    status: slot.busy ? "制作中" : slot.product.status === "succeeded" ? "已完成" : "",
  }));

  return (
    <>
      <MultiStoreTabs tabs={tabs} active={active} onChange={setActive} />
      <ProductGeneratePanel
        shopName={pi.shopName}
        setShopName={pi.setShopName}
        productName={pi.productName}
        setProductName={pi.setProductName}
        platform={pi.platform}
        setPlatform={pi.setPlatform}
        generationLine={pi.generationLine}
        setGenerationLine={pi.setGenerationLine}
        themeColor={pi.themeColor}
        setThemeColor={pi.setThemeColor}
        brandStyle={pi.brandStyle}
        setBrandStyle={pi.setBrandStyle}
        images={pi.images}
        setImages={pi.setImages}
        onGenerate={pi.handleGenerate}
        busy={pi.busy}
        elapsed={elapsed}
        product={pi.product}
      />
      <ProductResultPanel
        platform={pi.currentPlatform}
        shopName={pi.shopName}
        product={pi.product}
        onRetry={() => pi.retry()}
        onDownload={() => pi.handleDownload()}
      />
    </>
  );
}
