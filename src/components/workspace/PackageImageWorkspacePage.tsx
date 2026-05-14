import type { GenerationLine } from "../../types";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import PackageImagePage from "../PackageImagePage";

interface Props {
  packageImage: GenerationWorkspace["packageImage"];
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  elapsed: number;
}

export default function PackageImageWorkspacePage({
  packageImage,
  generationLine,
  setGenerationLine,
  elapsed,
}: Props) {
  return (
    <PackageImagePage
      shopName={packageImage.shopName}
      setShopName={packageImage.setShopName}
      platform={packageImage.platform}
      setPlatform={packageImage.setPlatform}
      currentPlatform={packageImage.currentPlatform}
      generationLine={generationLine}
      setGenerationLine={setGenerationLine}
      images={packageImage.images}
      setImages={packageImage.setImages}
      styleImages={packageImage.styleImages}
      setStyleImages={packageImage.setStyleImages}
      productNames={packageImage.productNames}
      item={packageImage.item}
      busy={packageImage.busy}
      elapsed={elapsed}
      onGenerate={packageImage.handleGenerate}
      onRetry={packageImage.retry}
      onDownload={packageImage.download}
    />
  );
}
