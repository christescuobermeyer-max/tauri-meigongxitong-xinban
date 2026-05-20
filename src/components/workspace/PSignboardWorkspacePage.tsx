import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import PSignboardPage from "../PSignboardPage";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["pSignboardSlots"];
  globalBusy?: boolean;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function PSignboardWorkspacePage({ slots, globalBusy = false }: Props) {
  const [active, setActive] = useState(0);
  const ps = slots[active];
  const tabs = slots.map((slot, index) => ({
    label: TAB_LABELS[index],
    shopName: slot.shopName.trim(),
    busy: slot.busy,
    status: slot.busy ? "制作中" : slot.item.status === "succeeded" ? "已完成" : "",
  }));

  return (
    <>
      <MultiStoreTabs tabs={tabs} active={active} onChange={setActive} />
      <PSignboardPage
        shopName={ps.shopName}
        images={ps.images}
        setImages={ps.setImages}
        originalText={ps.originalText}
        setOriginalText={ps.setOriginalText}
        newText={ps.newText}
        setNewText={ps.setNewText}
        item={ps.item}
        busy={ps.busy}
        submitDisabled={globalBusy || ps.busy}
        onGenerate={ps.handleGenerate}
        onRetry={ps.handleGenerate}
        onDownload={ps.handleDownload}
      />
    </>
  );
}
