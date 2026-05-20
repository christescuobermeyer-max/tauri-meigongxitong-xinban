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

function CapacityNotice({ workspace }: Props) {
  if (!workspace.generationCapacityFull) return null;
  return (
    <div className="concurrency-notice" role="status" aria-live="polite">
      当前账号已有 {workspace.activeGenerationTaskCount}/{workspace.generationTaskLimit} 个任务进行中，请等待一个任务完成后再提交新的生图。
    </div>
  );
}

export default function WorkspacePages({ workspace }: Props) {
  if (workspace.tab === "avatarStorefront") {
    return (
      <div className="page">
        <CapacityNotice workspace={workspace} />
        <ThreePieceWorkspacePage
          slots={workspace.threePieceSlots}
          elapsed={workspace.elapsed}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "productImage") {
    return (
      <div className="page">
        <CapacityNotice workspace={workspace} />
        <ProductImageWorkspacePage
          slots={workspace.productImageSlots}
          elapsed={workspace.elapsed}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "productBatch") {
    return (
      <div className="page">
        <CapacityNotice workspace={workspace} />
        <ProductBatchWorkspacePage
          slots={workspace.productBatchSlots}
          elapsed={workspace.elapsed}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "packageImage") {
    return (
      <div className="page">
        <CapacityNotice workspace={workspace} />
        <PackageImageWorkspacePage
          slots={workspace.packageImageSlots}
          elapsed={workspace.elapsed}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "pictureWall") {
    return (
      <div className="page picture-wall-page">
        <CapacityNotice workspace={workspace} />
        <PictureWallWorkspacePage
          slots={workspace.pictureWallSlots}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "pSignboard") {
    return (
      <div className="page page--single picture-wall-page">
        <CapacityNotice workspace={workspace} />
        <PSignboardWorkspacePage
          slots={workspace.pSignboardSlots}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "imageEdit") {
    return (
      <div className="page image-edit-page">
        <CapacityNotice workspace={workspace} />
        <ImageEditWorkspacePage
          slots={workspace.imageEditSlots}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "detailPage") {
    return (
      <div className="page picture-wall-page">
        <CapacityNotice workspace={workspace} />
        <DetailPageWorkspacePage
          slots={workspace.detailPageSlots}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "brandStory") {
    return (
      <div className="page brand-story-page">
        <CapacityNotice workspace={workspace} />
        <BrandStoryWorkspacePage
          slots={workspace.brandStorySlots}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "dataAnalysis") {
    return (
      <div className="page picture-wall-page">
        <CapacityNotice workspace={workspace} />
        <DataAnalysisWorkspacePage
          slots={workspace.dataAnalysisSlots}
          globalBusy={workspace.generationCapacityFull}
        />
      </div>
    );
  }

  if (workspace.tab === "patrolScript") {
    return (
      <div className="page picture-wall-page">
        <CapacityNotice workspace={workspace} />
        <PatrolScriptWorkspacePage
          slots={workspace.patrolScriptSlots}
          globalBusy={workspace.generationCapacityFull}
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
