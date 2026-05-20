import { useState } from "react";
import { IMAGE_EDIT_KINDS } from "../../lib/image-edit";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import ImageEditPage from "../ImageEditPage";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["imageEditSlots"];
  globalBusy?: boolean;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function ImageEditWorkspacePage({ slots, globalBusy = false }: Props) {
  const [active, setActive] = useState(0);
  const ie = slots[active];
  const tabs = slots.map((slot, index) => ({
    label: TAB_LABELS[index],
    shopName: slot.shopName.trim(),
    busy: slot.busy,
    status: slot.busy
      ? "制作中"
      : IMAGE_EDIT_KINDS.some((kind) => slot.entries[kind].item.status === "succeeded")
        ? "已完成"
        : "",
  }));

  return (
    <>
      <MultiStoreTabs tabs={tabs} active={active} onChange={setActive} />
      <ImageEditPage
        shopName={ie.shopName}
        setShopName={ie.setShopName}
        platform={ie.platform}
        setPlatform={ie.setPlatform}
        currentPlatform={ie.currentPlatform}
        entries={ie.entries}
        busy={ie.busy}
        submitDisabled={globalBusy || ie.busy}
        setImages={ie.setImages}
        setReferenceImages={ie.setReferenceImages}
        setInstruction={ie.setInstruction}
        onGenerate={ie.generate}
        onDownload={ie.download}
      />
    </>
  );
}
