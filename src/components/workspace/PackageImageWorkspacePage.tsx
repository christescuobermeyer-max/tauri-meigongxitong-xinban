import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import PackageImagePage from "../PackageImagePage";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["packageImageSlots"];
  elapsed: number;
  globalBusy?: boolean;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function PackageImageWorkspacePage({
  slots,
  elapsed,
  globalBusy = false,
}: Props) {
  const [active, setActive] = useState(0);
  const packageImage = slots[active];
  const tabs = slots.map((slot, index) => ({
    label: TAB_LABELS[index],
    shopName: slot.shopName.trim(),
    busy: slot.busy,
    status: slot.busy ? "制作中" : slot.item.status === "succeeded" ? "已完成" : "",
  }));

  return (
    <>
      <MultiStoreTabs tabs={tabs} active={active} onChange={setActive} />
      <PackageImagePage
        shopName={packageImage.shopName}
        setShopName={packageImage.setShopName}
        platform={packageImage.platform}
        setPlatform={packageImage.setPlatform}
        currentPlatform={packageImage.currentPlatform}
        images={packageImage.images}
        setImages={packageImage.setImages}
        styleImages={packageImage.styleImages}
        setStyleImages={packageImage.setStyleImages}
        productNames={packageImage.productNames}
        item={packageImage.item}
        busy={packageImage.busy}
        submitDisabled={globalBusy || packageImage.busy}
        elapsed={elapsed}
        onGenerate={packageImage.handleGenerate}
        onRetry={packageImage.retry}
        onDownload={packageImage.download}
      />
    </>
  );
}
