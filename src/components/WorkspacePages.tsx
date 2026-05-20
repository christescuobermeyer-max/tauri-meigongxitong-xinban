import AdminPage from "./AdminPage";
import HistoryPanel from "./HistoryPanel";
import BrandStoryWorkspacePage from "./workspace/BrandStoryWorkspacePage";
import DataAnalysisWorkspacePage from "./workspace/DataAnalysisWorkspacePage";
import DetailPageWorkspacePage from "./workspace/DetailPageWorkspacePage";
import ImageEditWorkspacePage from "./workspace/ImageEditWorkspacePage";
import PackageImageWorkspacePage from "./workspace/PackageImageWorkspacePage";
import PatrolScriptWorkspacePage from "./workspace/PatrolScriptWorkspacePage";
import PictureWallWorkspacePage from "./workspace/PictureWallWorkspacePage";
import PSignboardWorkspacePage from "./workspace/PSignboardWorkspacePage";
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
          slots={workspace.packageImageSlots}
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
    return (
      <div className="page page--single picture-wall-page">
        <PSignboardWorkspacePage
          slots={workspace.pSignboardSlots}
          globalBusy={workspace.busy}
        />
      </div>
    );
  }

  if (workspace.tab === "imageEdit") {
    return (
      <div className="page image-edit-page">
        <ImageEditWorkspacePage
          slots={workspace.imageEditSlots}
          globalBusy={workspace.busy}
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
    return (
      <div className="page picture-wall-page">
        <DataAnalysisWorkspacePage
          slots={workspace.dataAnalysisSlots}
          globalBusy={workspace.busy}
        />
      </div>
    );
  }

  if (workspace.tab === "patrolScript") {
    return (
      <div className="page picture-wall-page">
        <PatrolScriptWorkspacePage
          slots={workspace.patrolScriptSlots}
          globalBusy={workspace.busy}
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
