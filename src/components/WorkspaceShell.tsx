import AdminPage from "./AdminPage";
import GeneratePanel from "./GeneratePanel";
import HistoryPanel from "./HistoryPanel";
import PictureWallPage from "./PictureWallPage";
import PSignboardPage from "./PSignboardPage";
import ProductBatchGeneratePanel from "./ProductBatchGeneratePanel";
import ProductBatchResultPanel from "./ProductBatchResultPanel";
import ProductGeneratePanel from "./ProductGeneratePanel";
import ProductResultPanel from "./ProductResultPanel";
import ResultPanel from "./ResultPanel";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import TopBar from "./TopBar";
import useGenerationWorkspace from "../hooks/useGenerationWorkspace";
import { useTheme } from "../hooks/useTheme";
import type { ProfileRow } from "../lib/supabase";

interface Props {
  profile: ProfileRow;
  isAdmin: boolean;
  onSignOut: () => void;
}

export default function WorkspaceShell({ profile, isAdmin, onSignOut }: Props) {
  const workspace = useGenerationWorkspace({ userId: profile.id });
  const { theme, setTheme } = useTheme();

  const title =
    workspace.tab === "avatarStorefront"
      ? "三件套设计"
      : workspace.tab === "productImage"
        ? "制作1张设计图"
        : workspace.tab === "productBatch"
          ? "制作全店图"
          : workspace.tab === "pictureWall"
            ? "图片墙生成"
            : workspace.tab === "pSignboard"
              ? "P门头"
              : workspace.tab === "history"
                ? "历史记录"
                : "后台管理";

  return (
    <div className="app-shell">
      <Sidebar
        active={workspace.tab}
        onChange={workspace.setTab}
        isAdmin={isAdmin}
        displayName={profile.display_name}
        onSignOut={onSignOut}
      />
      <main className="main">
        <TopBar
          title={title}
          crumbs={["呈尚策划", "图像生成系统"]}
          rightSlot={
            <>
              <span className="badge" data-tone="info" title="今日已成功归档到 OSS 的图片数">
                今日已生图 <strong style={{ marginLeft: 4 }}>{workspace.todayCount}</strong> 张
              </span>
              <span className="badge" data-tone={workspace.busy ? "info" : "success"}>
                <span className={workspace.busy ? "dot dot--pulse" : "dot"} />
                {workspace.busy ? "生成中" : "就绪"}
              </span>
              <ThemeToggle theme={theme} onChange={setTheme} />
            </>
          }
        />
        <div className="main__scroll">
          {workspace.tab === "avatarStorefront" ? (
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
          ) : workspace.tab === "productImage" ? (
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
          ) : workspace.tab === "productBatch" ? (
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
          ) : workspace.tab === "pictureWall" ? (
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
          ) : workspace.tab === "pSignboard" ? (
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
                onReset={workspace.resetPSignboard}
              />
            </div>
          ) : workspace.tab === "history" ? (
            <div className="page page--single">
              <HistoryPanel entries={workspace.historyEntries} />
            </div>
          ) : (
            <div className="page page--single">
              <AdminPage />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
