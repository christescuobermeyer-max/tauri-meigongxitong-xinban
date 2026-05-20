import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import DataAnalysisPage from "../DataAnalysisPage";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["dataAnalysisSlots"];
  globalBusy?: boolean;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function DataAnalysisWorkspacePage({ slots, globalBusy = false }: Props) {
  const [active, setActive] = useState(0);
  const da = slots[active];
  const tabs = slots.map((slot, index) => ({
    label: TAB_LABELS[index],
    shopName: slot.storeName.trim(),
    busy: slot.busy,
    status: slot.busy ? "制作中" : slot.item.status === "succeeded" ? "已完成" : "",
  }));

  return (
    <>
      <MultiStoreTabs tabs={tabs} active={active} onChange={setActive} />
      <DataAnalysisPage
        storeName={da.storeName}
        setStoreName={da.setStoreName}
        images={da.images}
        setImages={da.setImages}
        item={da.item}
        busy={da.busy}
        submitDisabled={globalBusy || da.busy}
        onGenerate={da.handleGenerate}
        onRetry={da.handleRetry}
        onDownload={da.handleDownload}
      />
    </>
  );
}
