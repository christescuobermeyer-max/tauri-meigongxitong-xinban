import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import PictureWallPage from "../PictureWallPage";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["pictureWallSlots"];
  globalBusy?: boolean;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function PictureWallWorkspacePage({ slots, globalBusy = false }: Props) {
  const [active, setActive] = useState(0);
  const pw = slots[active];
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
      <PictureWallPage
        shopName={pw.shopName}
        setShopName={pw.setShopName}
        images={pw.images}
        setImages={pw.setImages}
        generationLine={pw.generationLine}
        setGenerationLine={pw.setGenerationLine}
        themeColor={pw.themeColor}
        setThemeColor={pw.setThemeColor}
        brandStyle={pw.brandStyle}
        setBrandStyle={pw.setBrandStyle}
        entries={pw.entries}
        completedCount={pw.completedCount}
        downloadStatus={pw.downloadStatus}
        busy={pw.busy}
        submitDisabled={globalBusy || pw.busy}
        onGenerate={pw.handleGenerate}
        onDownload={pw.handleDownload}
        onDownloadSingle={pw.handleDownloadSingle}
        onRetry={pw.handleRetry}
      />
    </>
  );
}
