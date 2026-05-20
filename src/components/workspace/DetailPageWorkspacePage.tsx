import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import DetailPagePage from "../DetailPagePage";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["detailPageSlots"];
  globalBusy?: boolean;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function DetailPageWorkspacePage({ slots, globalBusy = false }: Props) {
  const [active, setActive] = useState(0);
  const dp = slots[active];
  const tabs = slots.map((slot, index) => ({
    label: TAB_LABELS[index],
    shopName: slot.shopName.trim(),
    busy: slot.busy,
    status:
      slot.entries.length > 0
        ? slot.busy
          ? `制作中 ${slot.completedCount}/${slot.entries.length}`
          : slot.completedCount === slot.entries.length
            ? "已完成"
            : ""
        : "",
  }));

  return (
    <>
      <MultiStoreTabs tabs={tabs} active={active} onChange={setActive} />
      <DetailPagePage
        shopName={dp.shopName}
        setShopName={dp.setShopName}
        images={dp.images}
        setImages={dp.setImages}
        generationLine={dp.generationLine}
        setGenerationLine={dp.setGenerationLine}
        entries={dp.entries}
        completedCount={dp.completedCount}
        busy={dp.busy}
        submitDisabled={globalBusy || dp.busy}
        onGenerate={dp.handleGenerate}
        onRetry={dp.handleRetry}
        onDownload={dp.handleDownload}
        onDownloadItem={dp.handleDownloadItem}
      />
    </>
  );
}
