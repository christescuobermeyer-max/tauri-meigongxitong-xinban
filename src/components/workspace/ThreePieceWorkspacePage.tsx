import { useState } from "react";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import GeneratePanel from "../GeneratePanel";
import ResultPanel from "../ResultPanel";
import MultiStoreTabs from "./MultiStoreTabs";

interface Props {
  slots: GenerationWorkspace["threePieceSlots"];
  elapsed: number;
  globalBusy?: boolean;
}

const TAB_LABELS = ["店铺1", "店铺2", "店铺3", "店铺4", "店铺5"];

export default function ThreePieceWorkspacePage({ slots, elapsed, globalBusy = false }: Props) {
  const [active, setActive] = useState(0);
  const tp = slots[active];
  const tabs = slots.map((slot, index) => ({
    label: TAB_LABELS[index],
    shopName: slot.shopName.trim(),
    busy: slot.busy,
    status: describe(slot),
  }));

  return (
    <>
      <MultiStoreTabs tabs={tabs} active={active} onChange={setActive} />
      <GeneratePanel
        shopName={tp.shopName}
        setShopName={tp.setShopName}
        generationLine={tp.generationLine}
        setGenerationLine={tp.setGenerationLine}
        avatarMode={tp.avatarMode}
        avatarCategory={tp.avatarCategory}
        setAvatarCategory={tp.setAvatarCategory}
        themeColor={tp.themeColor}
        setThemeColor={tp.setThemeColor}
        brandStyle={tp.brandStyle}
        setBrandStyle={tp.setBrandStyle}
        images={tp.images}
        setImages={tp.setImages}
        onGenerate={tp.handleGenerate}
        busy={tp.busy}
        submitDisabled={globalBusy || tp.busy}
        elapsed={elapsed}
        avatar={tp.avatar}
        storefront={tp.storefront}
        poster={tp.poster}
      />
      <ResultPanel
        shopName={tp.shopName}
        avatar={tp.avatar}
        storefront={tp.storefront}
        poster={tp.poster}
        onRetry={(kind) => tp.retry(kind as "avatar" | "storefront" | "poster")}
        onDownload={(kind, platform) =>
          tp.handleDownload(kind as "avatar" | "storefront" | "poster", platform)
        }
        onBatchDownload={(platform) => tp.handleBatchDownload(platform)}
        canBatchDownload={tp.canBatchDownload}
      />
    </>
  );
}

function describe(slot: GenerationWorkspace["threePieceSlots"][number]): string {
  if (!slot.busy) return "";
  const running = [slot.avatar, slot.storefront, slot.poster].filter(
    (item) => item.status === "running" || item.status === "queued"
  );
  return running.length ? `进行中 ${running.length}/3` : "";
}
