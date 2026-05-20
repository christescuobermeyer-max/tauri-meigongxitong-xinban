import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import PatrolScriptPage from "../PatrolScriptPage";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["patrolScriptSlots"];
  globalBusy?: boolean;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function PatrolScriptWorkspacePage({ slots, globalBusy = false }: Props) {
  const [active, setActive] = useState(0);
  const ps = slots[active];
  const tabs = slots.map((slot, index) => ({
    label: TAB_LABELS[index],
    shopName: slot.storeName.trim(),
    busy: slot.busy,
    status: slot.busy ? "制作中" : slot.item.status === "succeeded" ? "已完成" : "",
  }));

  return (
    <>
      <MultiStoreTabs tabs={tabs} active={active} onChange={setActive} />
      <PatrolScriptPage
        storeName={ps.storeName}
        setStoreName={ps.setStoreName}
        scriptId={ps.scriptId}
        setScriptId={ps.setScriptId}
        selectedScript={ps.selectedScript}
        item={ps.item}
        busy={ps.busy}
        submitDisabled={globalBusy || ps.busy}
        onGenerate={ps.handleGenerate}
        onRetry={ps.handleRetry}
        onCopyScript={ps.handleCopyScript}
        onDownload={ps.handleDownload}
      />
    </>
  );
}
