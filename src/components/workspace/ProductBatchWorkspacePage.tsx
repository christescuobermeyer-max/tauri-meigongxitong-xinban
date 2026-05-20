import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import ProductBatchGeneratePanel from "../ProductBatchGeneratePanel";
import ProductBatchResultPanel from "../ProductBatchResultPanel";

interface Props {
  slots: GenerationWorkspace["productBatchSlots"];
  elapsed: number;
  globalBusy?: boolean;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"] as const;

export default function ProductBatchWorkspacePage({ slots, elapsed, globalBusy = false }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slot = slots[activeIndex];

  return (
    <>
      <div className="product-batch-tabs" role="tablist" aria-label="店铺切换">
        {slots.map((slotItem, index) => {
          const isActive = activeIndex === index;
          const status = describeSlotStatus(slotItem);
          return (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-active={isActive}
              data-busy={slotItem.busy}
              className="product-batch-tabs__item"
              onClick={() => setActiveIndex(index)}
            >
              <span className="product-batch-tabs__label">{TAB_LABELS[index]}</span>
              {slotItem.shopName.trim() && (
                <span className="product-batch-tabs__shop">{slotItem.shopName.trim()}</span>
              )}
              {status && <span className="product-batch-tabs__status">{status}</span>}
            </button>
          );
        })}
      </div>

      <ProductBatchGeneratePanel
        shopName={slot.shopName}
        setShopName={slot.setShopName}
        platform={slot.platform}
        setPlatform={slot.setPlatform}
        generationLine={slot.generationLine}
        setGenerationLine={slot.setGenerationLine}
        themeColor={slot.themeColor}
        setThemeColor={slot.setThemeColor}
        brandStyle={slot.brandStyle}
        setBrandStyle={slot.setBrandStyle}
        images={slot.images}
        setImages={slot.setImages}
        styleImages={slot.styleImages}
        setStyleImages={slot.setStyleImages}
        entries={slot.entries}
        onGenerate={slot.handleGenerate}
        busy={slot.busy}
        submitDisabled={globalBusy || slot.busy}
        uploadingOss={slot.uploadingOss}
        elapsed={elapsed}
      />
      <ProductBatchResultPanel
        platform={slot.currentPlatform}
        shopName={slot.shopName}
        entries={slot.entries}
        completedCount={slot.completedCount}
        onRetry={slot.retry}
        onDownload={slot.download}
        onBatchDownload={slot.downloadAll}
      />
    </>
  );
}

function describeSlotStatus(slot: GenerationWorkspace["productBatchSlots"][number]): string {
  if (slot.uploadingOss) return "上传中";
  const running = slot.entries.filter(
    (entry) => entry.item.status === "queued" || entry.item.status === "running"
  ).length;
  if (running > 0) return `制作中 ${slot.completedCount}/${slot.entries.length}`;
  if (slot.entries.length > 0 && slot.completedCount === slot.entries.length) return "已完成";
  return "";
}
