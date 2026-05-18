import type { PictureWallEntry } from "../lib/picture-wall";
import type { PictureWallDownloadProgress } from "../lib/picture-wall-download";
import { copyGeneratedItemImage } from "../lib/clipboard-image";
import { getGenerationPreviewUrl } from "../lib/generation-preview";
import BatchDownloadButton from "./BatchDownloadButton";
import { IconAlert, IconCheck, IconCopy, IconDownload, IconImage, IconRefresh } from "./Icons";
import GenerationStatusBadge from "./GenerationStatusBadge";
import MerchantCopyCard from "./MerchantCopyCard";
import { useToast } from "./Toast";

const PICTURE_WALL_COPY_TEXT =
  "我们为店铺上线了专业设计的图片墙，这是美团平台推荐的核心运营策略之一。数据显示，拥有完整图片墙的店铺在同类竞争中的点击率平均提升32%，顾客停留时间延长28%。这三张统一风格的图片不仅提升了我们的品牌专业形象，更重要的是增强了顾客对食品品质的信任感，有效提高了菜品转化率和客单价。";

interface Props {
  entries: PictureWallEntry[];
  shopName: string;
  completedCount: number;
  downloadStatus: (PictureWallDownloadProgress & { active: boolean }) | null;
  busy: boolean;
  onDownload: () => void;
  onDownloadSingle: (sourceImageId: string) => void;
  onRetry: (sourceImageId: string) => void;
}

export default function PictureWallResults({
  entries,
  shopName,
  completedCount,
  downloadStatus,
  busy,
  onDownload,
  onDownloadSingle,
  onRetry,
}: Props) {
  const canDownload = completedCount > 0 && !busy && !downloadStatus?.active;
  return (
    <section className="card">
      <div className="card__header">
        <div className="card__heading">
          <div className="card__title">生成结果</div>
          <span className="card__hint">
            店铺 {shopName || "—"} · 已完成 {completedCount} / {entries.length || 3}
          </span>
        </div>
        <BatchDownloadButton
          label={downloadStatus?.active ? "下载中…" : "批量下载图片墙"}
          meta={`已完成 ${completedCount}/${entries.length || 3}`}
          disabled={!canDownload}
          onClick={onDownload}
          title="批量下载已生成成功的图片墙"
        />
      </div>
      <div className="card__body">
        {downloadStatus ? (
          <div className="picture-wall-download-status" data-active={downloadStatus.active}>
            {downloadStatus.active ? <div className="spinner" /> : <IconCheck style={{ width: 16, height: 16 }} />}
            <div>
              <strong>{downloadStatus.active ? "正在下载图片" : "图片下载完成"}</strong>
              <span>
                {downloadStatus.message} · {downloadStatus.savedCount}/{downloadStatus.totalCount} 个文件
              </span>
            </div>
          </div>
        ) : null}
        {entries.length === 0 ? (
          <div className="picture-wall-empty">
            <IconImage style={{ width: 22, height: 22 }} />
            <strong>上传 3 张产品图后即可生成图片墙</strong>
            <span>生成后可批量下载高清原图 + 240×330 版本</span>
          </div>
        ) : (
          <div className="picture-wall-grid">
            {entries.map((entry, index) => (
              <PictureWallTile
                key={entry.sourceImageId}
                entry={entry}
                index={index}
                busy={busy}
                downloading={downloadStatus?.active === true}
                onRetry={onRetry}
                onDownloadSingle={onDownloadSingle}
              />
            ))}
          </div>
        )}
        <MerchantCopyCard text={PICTURE_WALL_COPY_TEXT} successMessage="图片墙沟通文案已复制到剪贴板" />
      </div>
    </section>
  );
}

function PictureWallTile({
  entry,
  index,
  busy,
  downloading,
  onRetry,
  onDownloadSingle,
}: {
  entry: PictureWallEntry;
  index: number;
  busy: boolean;
  downloading: boolean;
  onRetry: (sourceImageId: string) => void;
  onDownloadSingle: (sourceImageId: string) => void;
}) {
  const toast = useToast();
  const status = entry.item.status;
  const isTileBusy = status === "queued" || status === "running";
  const errorMessage = getPictureWallErrorMessage(entry.item.errorMessage);
  const previewUrl = getGenerationPreviewUrl(entry.item);

  async function handleCopyImage() {
    try {
      await copyGeneratedItemImage(entry.item);
      toast.show(`图片墙第 ${index + 1} 张已复制到剪贴板`, "success");
    } catch (error: unknown) {
      toast.show(
        `复制图片失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  const busyTitle =
    status === "queued"
      ? "等待生成中…"
      : "正在生成第 " + (index + 1) + " 张…";
  const busyHint =
    status === "queued"
      ? "前序图片完成后会自动开始"
      : "系统单次最长可能需要1-5分钟，请耐心等待";

  return (
    <article className="picture-wall-tile" data-status={status}>
      <div className="picture-wall-tile__head">
        <span className="picture-wall-tile__index">第 {index + 1} 张</span>
        <span className="picture-wall-tile__badge">
          <GenerationStatusBadge status={status} elapsedMs={entry.item.elapsedMs} attempt={entry.item.attempt} />
        </span>
      </div>
      {status === "failed" ? (
        <div className="picture-wall-tile__meta picture-wall-tile__meta--failed">
          <div className="picture-wall-state picture-wall-state--error picture-wall-state--compact">
            <IconAlert style={{ width: 20, height: 20 }} />
            <strong>生成失败</strong>
            <span className="picture-wall-state__message" title={errorMessage.full}>
              {errorMessage.short}
            </span>
          </div>
          <button
            className="btn btn--secondary btn--sm picture-wall-tile__retry"
            disabled={busy}
            onClick={() => onRetry(entry.sourceImageId)}
            type="button"
          >
            <IconRefresh style={{ width: 13, height: 13 }} />
            重试
          </button>
        </div>
      ) : null}
      <div className="picture-wall-tile__preview" data-busy={isTileBusy}>
        {previewUrl ? (
          <img src={previewUrl} alt={`图片墙结果 ${index + 1}`} />
        ) : status === "failed" ? (
          <div className="picture-wall-state picture-wall-state--error">
            <IconAlert style={{ width: 20, height: 20 }} />
            <strong>生成失败</strong>
            <span className="picture-wall-state__message">点击上方重试重新生成</span>
          </div>
        ) : isTileBusy ? (
          <div className="picture-wall-state">
            <div className="spinner spinner--lg" />
            <strong>{busyTitle}</strong>
            <span>{busyHint}</span>
          </div>
        ) : (
          <div className="picture-wall-state">
            {status === "succeeded" ? <IconCheck /> : <IconImage />}
            <strong>未生成</strong>
            <span>{entry.sourceName}</span>
          </div>
        )}
      </div>
      {status === "succeeded" && entry.item.rawBase64 ? (
        <div className="picture-wall-tile__footer">
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={busy || downloading}
            title="复制图片到剪贴板"
            onClick={handleCopyImage}
          >
            <IconCopy style={{ width: 13, height: 13 }} />
            复制图片
          </button>
          <button
            className="btn btn--secondary btn--sm picture-wall-tile__download"
            type="button"
            disabled={busy || downloading}
            title="下载本张：高清原图 + 240×330"
            onClick={() => onDownloadSingle(entry.sourceImageId)}
          >
            <IconDownload style={{ width: 13, height: 13 }} />
            下载本张（高清原图 + 240×330）
          </button>
        </div>
      ) : null}
    </article>
  );
}

function getPictureWallErrorMessage(message?: string) {
  const full = message?.trim() || "点击重试重新生成";
  const short = full.length > 90 ? `${full.slice(0, 90)}…` : full;
  return { full, short };
}
