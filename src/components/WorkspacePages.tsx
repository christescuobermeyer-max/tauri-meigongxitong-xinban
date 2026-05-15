import AdminPage from "./AdminPage";
import BrandStoryPage from "./BrandStoryPage";
import DataAnalysisPage from "./DataAnalysisPage";
import DetailPagePage from "./DetailPagePage";
import GeneratePanel from "./GeneratePanel";
import HistoryPanel from "./HistoryPanel";
import ImageEditPage from "./ImageEditPage";
import PatrolScriptPage from "./PatrolScriptPage";
import PictureWallPage from "./PictureWallPage";
import PSignboardPage from "./PSignboardPage";
import ProductGeneratePanel from "./ProductGeneratePanel";
import ProductResultPanel from "./ProductResultPanel";
import ResultPanel from "./ResultPanel";
import PackageImageWorkspacePage from "./workspace/PackageImageWorkspacePage";
import ProductBatchWorkspacePage from "./workspace/ProductBatchWorkspacePage";
import type { GenerationWorkspace } from "../hooks/useGenerationWorkspace";

interface Props {
  workspace: GenerationWorkspace;
}

export default function WorkspacePages({ workspace }: Props) {
  if (workspace.tab === "avatarStorefront") {
    const tp = workspace.threePiece;
    return (
      <div className="page">
        <GeneratePanel
          shopName={tp.shopName}
          setShopName={tp.setShopName}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
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
          elapsed={workspace.elapsed}
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
      </div>
    );
  }

  if (workspace.tab === "productImage") {
    const pi = workspace.productImage;
    return (
      <div className="page">
        <ProductGeneratePanel
          shopName={pi.shopName}
          setShopName={pi.setShopName}
          productName={pi.productName}
          setProductName={pi.setProductName}
          platform={pi.platform}
          setPlatform={pi.setPlatform}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          themeColor={pi.themeColor}
          setThemeColor={pi.setThemeColor}
          brandStyle={pi.brandStyle}
          setBrandStyle={pi.setBrandStyle}
          images={pi.images}
          setImages={pi.setImages}
          onGenerate={pi.handleGenerate}
          busy={pi.busy}
          elapsed={workspace.elapsed}
          product={pi.product}
        />
        <ProductResultPanel
          platform={pi.currentPlatform}
          shopName={pi.shopName}
          product={pi.product}
          onRetry={() => pi.retry()}
          onDownload={() => pi.handleDownload()}
        />
      </div>
    );
  }

  if (workspace.tab === "productBatch") {
    return (
      <div className="page">
        <ProductBatchWorkspacePage
          productBatch={workspace.productBatch}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          elapsed={workspace.elapsed}
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
        />
      </div>
    );
  }

  if (workspace.tab === "pictureWall") {
    const pw = workspace.pictureWall;
    return (
      <div className="page picture-wall-page">
        <PictureWallPage
          shopName={pw.shopName}
          setShopName={pw.setShopName}
          images={pw.images}
          setImages={pw.setImages}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          themeColor={pw.themeColor}
          setThemeColor={pw.setThemeColor}
          brandStyle={pw.brandStyle}
          setBrandStyle={pw.setBrandStyle}
          entries={pw.entries}
          completedCount={pw.completedCount}
          downloadStatus={pw.downloadStatus}
          busy={pw.busy}
          onGenerate={pw.handleGenerate}
          onDownload={pw.handleDownload}
          onDownloadSingle={pw.handleDownloadSingle}
          onRetry={pw.handleRetry}
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
    const dp = workspace.detailPage;
    return (
      <div className="page picture-wall-page">
        <DetailPagePage
          shopName={dp.shopName}
          setShopName={dp.setShopName}
          images={dp.images}
          setImages={dp.setImages}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
          entries={dp.entries}
          completedCount={dp.completedCount}
          busy={dp.busy}
          onGenerate={dp.handleGenerate}
          onRetry={dp.handleRetry}
          onDownload={dp.handleDownload}
          onDownloadItem={dp.handleDownloadItem}
        />
      </div>
    );
  }

  if (workspace.tab === "brandStory") {
    const bs = workspace.brandStory;
    return (
      <div className="page brand-story-page">
        <BrandStoryPage
          storeName={bs.storeName}
          setStoreName={bs.setStoreName}
          category={bs.category}
          setCategory={bs.setCategory}
          generationLine={workspace.generationLine}
          setGenerationLine={workspace.setGenerationLine}
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
