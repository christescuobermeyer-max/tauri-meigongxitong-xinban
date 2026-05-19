import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import BrandStoryPage from "../BrandStoryPage";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["brandStorySlots"];
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function BrandStoryWorkspacePage({ slots }: Props) {
  const [active, setActive] = useState(0);
  const bs = slots[active];
  const tabs = slots.map((slot, index) => ({
    label: TAB_LABELS[index],
    shopName: slot.storeName.trim(),
    busy: slot.busy,
    status: describe(slot),
  }));

  return (
    <>
      <MultiStoreTabs tabs={tabs} active={active} onChange={setActive} />
      <BrandStoryPage
        storeName={bs.storeName}
        setStoreName={bs.setStoreName}
        category={bs.category}
        setCategory={bs.setCategory}
        generationLine={bs.generationLine}
        setGenerationLine={bs.setGenerationLine}
        copy={bs.copy}
        entries={bs.entries}
        busy={bs.busy}
        textBusy={bs.textBusy}
        imagesBusy={bs.imagesBusy}
        phase={bs.phase}
        imageProgress={bs.imageProgress}
        completedCount={bs.completedCount}
        onGenerate={bs.handleGenerate}
        onRetry={bs.handleRetryImage}
        onDownload={bs.handleDownload}
        onDownloadItem={bs.handleDownloadItem}
      />
    </>
  );
}

function describe(slot: GenerationWorkspace["brandStorySlots"][number]): string {
  if (slot.textBusy) return "生成文案中";
  if (slot.imagesBusy) return `配图中 ${slot.imageProgress}/${slot.entries.length}`;
  if (slot.phase === "done") return "已完成";
  return "";
}
