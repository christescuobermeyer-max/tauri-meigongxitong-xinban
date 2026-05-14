import type { GenerationLine } from "../../types";
import type { GenerationWorkspace } from "../../hooks/useGenerationWorkspace";
import ProductBatchGeneratePanel from "../ProductBatchGeneratePanel";
import ProductBatchResultPanel from "../ProductBatchResultPanel";

interface Props {
  productBatch: GenerationWorkspace["productBatch"];
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  elapsed: number;
}

export default function ProductBatchWorkspacePage({
  productBatch,
  generationLine,
  setGenerationLine,
  elapsed,
}: Props) {
  return (
    <>
      <ProductBatchGeneratePanel
        shopName={productBatch.shopName}
        setShopName={productBatch.setShopName}
        platform={productBatch.platform}
        setPlatform={productBatch.setPlatform}
        generationLine={generationLine}
        setGenerationLine={setGenerationLine}
        themeColor={productBatch.themeColor}
        setThemeColor={productBatch.setThemeColor}
        brandStyle={productBatch.brandStyle}
        setBrandStyle={productBatch.setBrandStyle}
        images={productBatch.images}
        setImages={productBatch.setImages}
        styleImages={productBatch.styleImages}
        setStyleImages={productBatch.setStyleImages}
        entries={productBatch.entries}
        onGenerate={productBatch.handleGenerate}
        busy={productBatch.busy}
        elapsed={elapsed}
      />
      <ProductBatchResultPanel
        platform={productBatch.currentPlatform}
        shopName={productBatch.shopName}
        entries={productBatch.entries}
        completedCount={productBatch.completedCount}
        onRetry={productBatch.retry}
        onDownload={productBatch.download}
        onBatchDownload={productBatch.downloadAll}
      />
    </>
  );
}
