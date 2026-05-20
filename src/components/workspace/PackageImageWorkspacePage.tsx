import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import PackageImagePage from "../PackageImagePage";

interface Props {
  packageImage: GenerationWorkspace["packageImage"];
  elapsed: number;
  globalBusy?: boolean;
}

export default function PackageImageWorkspacePage({
  packageImage,
  elapsed,
  globalBusy = false,
}: Props) {
  return (
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
  );
}
