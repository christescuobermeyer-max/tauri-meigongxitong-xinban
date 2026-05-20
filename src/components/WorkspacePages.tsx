import AdminPage from "./AdminPage";
import DataAnalysisPage from "./DataAnalysisPage";
import HistoryPanel from "./HistoryPanel";
import ImageEditPage from "./ImageEditPage";
import PatrolScriptPage from "./PatrolScriptPage";
import PSignboardPage from "./PSignboardPage";
import BrandStoryWorkspacePage from "./workspace/BrandStoryWorkspacePage";
import DetailPageWorkspacePage from "./workspace/DetailPageWorkspacePage";
import PackageImageWorkspacePage from "./workspace/PackageImageWorkspacePage";
import PictureWallWorkspacePage from "./workspace/PictureWallWorkspacePage";
import ProductBatchWorkspacePage from "./workspace/ProductBatchWorkspacePage";
import ProductImageWorkspacePage from "./workspace/ProductImageWorkspacePage";
import ThreePieceWorkspacePage from "./workspace/ThreePieceWorkspacePage";
import type { GenerationWorkspace } from "../hooks/useGenerationWorkspace";

interface Props {
  workspace: GenerationWorkspace;
}

export default function WorkspacePages({ workspace }: Props) {
  if (workspace.tab === "avatarStorefront") {
    return (
      <div className="page">
        <ThreePieceWorkspacePage
          slots={workspace.threePieceSlots}
          elapsed={workspace.elapsed}
          globalBusy={workspace.busy}
        />
      </div>
    );
  }

  if (workspace.tab === "productImage") {
    return (
      <div className="page">
        <ProductImageWorkspacePage
          slots={workspace.productImageSlots}
          elapsed={workspace.elapsed}
          globalBusy={workspace.busy}
        />
      </div>
    );
  }

  if (workspace.tab === "productBatch") {
    return (
      <div className="page">
        <ProductBatchWorkspacePage
          slots={workspace.productBatchSlots}
          elapsed={workspace.elapsed}
          globalBusy={workspace.busy}
        />
      </div>
    );
  }

  if (workspace.tab === "packageImage") {
    return (
      <div className="page">
        <PackageImageWorkspacePage
          packageImage={workspace.packageImage}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          elapsed={workspace.elapsed}
          globalBusy={workspace.busy}
        />
      </div>
    );
  }

  if (workspace.tab === "pictureWall") {
    return (
      <div className="page picture-wall-page">
        <PictureWallWorkspacePage
          slots={workspace.pictureWallSlots}
          globalBusy={workspace.busy}
        />
      </div>
    );
  }

  if (workspace.tab === "pSignboard") {
    const ps = workspace.pSignboard;
    return (
      <div className="page page--single picture-wall-page">
        <PSignboardPage
          shopName={ps.shopName}
          images={ps.images}
          setImages={ps.setImages}
          originalText={ps.originalText}
          setOriginalText={ps.setOriginalText}
          newText={ps.newText}
          setNewText={ps.setNewText}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          item={ps.item}
          busy={ps.busy}
          submitDisabled={workspace.busy || ps.busy}
          onGenerate={ps.handleGenerate}
          onRetry={ps.handleGenerate}
          onDownload={ps.handleDownload}
        />
      </div>
    );
  }

  if (workspace.tab === "imageEdit") {
    const ie = workspace.imageEdit;
    return (
      <div className="page image-edit-page">
        <ImageEditPage
          shopName={ie.shopName}
          setShopName={ie.setShopName}
          platform={ie.platform}
          setPlatform={ie.setPlatform}
          currentPlatform={ie.currentPlatform}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          entries={ie.entries}
          busy={ie.busy}
          submitDisabled={workspace.busy || ie.busy}
          setImages={ie.setImages}
          setReferenceImages={ie.setReferenceImages}
          setInstruction={ie.setInstruction}
          onGenerate={ie.generate}
          onDownload={ie.download}
        />
      </div>
    );
  }

  if (workspace.tab === "detailPage") {
    return (
      <div className="page picture-wall-page">
        <DetailPageWorkspacePage
          slots={workspace.detailPageSlots}
          globalBusy={workspace.busy}
        />
      </div>
    );
  }

  if (workspace.tab === "brandStory") {
    return (
      <div className="page brand-story-page">
        <BrandStoryWorkspacePage
          slots={workspace.brandStorySlots}
          globalBusy={workspace.busy}
        />
      </div>
    );
  }

  if (workspace.tab === "dataAnalysis") {
    const da = workspace.dataAnalysis;
    return (
      <div className="page picture-wall-page">
        <DataAnalysisPage
          storeName={da.storeName}
          setStoreName={da.setStoreName}
          images={da.images}
          setImages={da.setImages}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          item={da.item}
          busy={da.busy}
          submitDisabled={workspace.busy || da.busy}
          onGenerate={da.handleGenerate}
          onRetry={da.handleRetry}
          onDownload={da.handleDownload}
        />
      </div>
    );
  }

  if (workspace.tab === "patrolScript") {
    const ps = workspace.patrolScript;
    return (
      <div className="page picture-wall-page">
        <PatrolScriptPage
          storeName={ps.storeName}
          setStoreName={ps.setStoreName}
          scriptId={ps.scriptId}
          setScriptId={ps.setScriptId}
          selectedScript={ps.selectedScript}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          item={ps.item}
          busy={ps.busy}
          submitDisabled={workspace.busy || ps.busy}
          onGenerate={ps.handleGenerate}
          onRetry={ps.handleRetry}
          onCopyScript={ps.handleCopyScript}
          onDownload={ps.handleDownload}
        />
      </div>
    );
  }

  if (workspace.tab === "history") {
    const cloudHistoryProps = workspace.historyUsesCloud
      ? {
          totalCount: workspace.historyTotalCount,
          page: workspace.historyPage,
          loading: workspace.historyLoading,
          onPageChange: workspace.setHistoryPage,
        }
      : {};
    return (
      <div className="page page--single">
        <HistoryPanel
          entries={workspace.historyEntries}
          {...cloudHistoryProps}
        />
      </div>
    );
  }

  return (
    <div className="page page--single">
      <AdminPage />
    </div>
  );
}
