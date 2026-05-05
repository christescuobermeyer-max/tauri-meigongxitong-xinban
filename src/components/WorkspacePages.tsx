import AdminPage from "./AdminPage";
import GeneratePanel from "./GeneratePanel";
import HistoryPanel from "./HistoryPanel";
import ImageEditPage from "./ImageEditPage";
import PictureWallPage from "./PictureWallPage";
import PSignboardPage from "./PSignboardPage";
import ProductBatchGeneratePanel from "./ProductBatchGeneratePanel";
import ProductBatchResultPanel from "./ProductBatchResultPanel";
import ProductGeneratePanel from "./ProductGeneratePanel";
import ProductResultPanel from "./ProductResultPanel";
import ResultPanel from "./ResultPanel";
import type { GenerationWorkspace } from "../hooks/useGenerationWorkspace";

interface Props {
  workspace: GenerationWorkspace;
}

export default function WorkspacePages({ workspace }: Props) {
  if (workspace.tab === "avatarStorefront") {
    return (
      <div className="page">
        <GeneratePanel
          shopName={workspace.shopName}
          setShopName={workspace.setShopName}
          platform={workspace.platform}
          setPlatform={workspace.setPlatform}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          avatarMode={workspace.avatarMode}
          avatarCategory={workspace.avatarCategory}
          setAvatarCategory={workspace.setAvatarCategory}
          images={workspace.images}
          setImages={workspace.setImages}
          onGenerate={workspace.handleGenerateAll}
          busy={workspace.busy}
          elapsed={workspace.elapsed}
          avatar={workspace.avatar}
          storefront={workspace.storefront}
          poster={workspace.poster}
        />
        <ResultPanel
          platform={workspace.currentPlatform}
          shopName={workspace.shopName}
          avatar={workspace.avatar}
          storefront={workspace.storefront}
          poster={workspace.poster}
          onRetry={(kind) => workspace.retryGeneration(kind)}
          onDownload={(kind) => workspace.handleDownload(kind)}
          onBatchDownload={workspace.handleBatchDownload}
          canBatchDownload={workspace.canBatchDownload}
        />
      </div>
    );
  }

  if (workspace.tab === "productImage") {
    return (
      <div className="page">
        <ProductGeneratePanel
          shopName={workspace.shopName}
          setShopName={workspace.setShopName}
          productName={workspace.productName}
          setProductName={workspace.setProductName}
          platform={workspace.platform}
          setPlatform={workspace.setPlatform}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          images={workspace.images}
          setImages={workspace.setImages}
          onGenerate={workspace.handleGenerateProduct}
          busy={workspace.busy}
          elapsed={workspace.elapsed}
          product={workspace.product}
        />
        <ProductResultPanel
          platform={workspace.currentPlatform}
          shopName={workspace.shopName}
          product={workspace.product}
          onRetry={() => workspace.retryGeneration("product")}
          onDownload={() => workspace.handleDownload("product")}
        />
      </div>
    );
  }

  if (workspace.tab === "productBatch") {
    return (
      <div className="page">
        <ProductBatchGeneratePanel
          shopName={workspace.shopName}
          setShopName={workspace.setShopName}
          platform={workspace.platform}
          setPlatform={workspace.setPlatform}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          images={workspace.productBatchImages}
          setImages={workspace.setProductBatchImages}
          styleImages={workspace.productBatchStyleImages}
          setStyleImages={workspace.setProductBatchStyleImages}
          entries={workspace.productBatchEntries}
          onGenerate={workspace.handleGenerateProductBatch}
          busy={workspace.busy}
          elapsed={workspace.elapsed}
        />
        <ProductBatchResultPanel
          platform={workspace.currentPlatform}
          shopName={workspace.shopName}
          entries={workspace.productBatchEntries}
          completedCount={workspace.productBatchCompletedCount}
          onRetry={workspace.retryProductBatchItem}
          onDownload={workspace.handleDownloadProductBatchItem}
        />
      </div>
    );
  }

  if (workspace.tab === "pictureWall") {
    return (
      <div className="page picture-wall-page">
        <PictureWallPage
          shopName={workspace.shopName}
          setShopName={workspace.setShopName}
          images={workspace.pictureWallImages}
          setImages={workspace.setPictureWallImages}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          entries={workspace.pictureWallEntries}
          completedCount={workspace.pictureWallCompletedCount}
          downloadStatus={workspace.pictureWallDownloadStatus}
          busy={workspace.busy}
          onGenerate={workspace.handleGeneratePictureWall}
          onDownload={workspace.handleDownloadPictureWall}
          onRetry={workspace.retryPictureWallItem}
        />
      </div>
    );
  }

  if (workspace.tab === "pSignboard") {
    return (
      <div className="page page--single picture-wall-page">
        <PSignboardPage
          shopName={workspace.shopName}
          images={workspace.pSignboardImages}
          setImages={workspace.setPSignboardImages}
          originalText={workspace.pSignboardOriginalText}
          setOriginalText={workspace.setPSignboardOriginalText}
          newText={workspace.pSignboardNewText}
          setNewText={workspace.setPSignboardNewText}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          item={workspace.pSignboardItem}
          busy={workspace.pSignboardBusy}
          onGenerate={workspace.handleGeneratePSignboard}
          onRetry={workspace.handleGeneratePSignboard}
          onDownload={workspace.handleDownloadPSignboard}
        />
      </div>
    );
  }

  if (workspace.tab === "imageEdit") {
    return (
      <div className="page image-edit-page">
        <ImageEditPage
          shopName={workspace.shopName}
          setShopName={workspace.setShopName}
          platform={workspace.platform}
          setPlatform={workspace.setPlatform}
          currentPlatform={workspace.currentPlatform}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          entries={workspace.imageEditEntries}
          busy={workspace.imageEditBusy}
          setImages={workspace.setImageEditImages}
          setInstruction={workspace.setImageEditInstruction}
          onGenerate={workspace.handleGenerateImageEdit}
          onDownload={workspace.handleDownloadImageEdit}
        />
      </div>
    );
  }

  if (workspace.tab === "history") {
    return (
      <div className="page page--single">
        <HistoryPanel entries={workspace.historyEntries} />
      </div>
    );
  }

  return (
    <div className="page page--single">
      <AdminPage />
    </div>
  );
}
