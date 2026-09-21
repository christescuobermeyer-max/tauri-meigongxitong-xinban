import {
  getImageEditBatchCompletedCount,
  getImageEditSpec,
  IMAGE_EDIT_BATCH_MAX_IMAGES,
  IMAGE_EDIT_LABEL,
  type ImageEditBatchEntry,
  type ImageEditKind,
  type ImageEditMode,
} from "../lib/image-edit";
import type { GenerationItem, PlatformSpec } from "../types";
import BatchDownloadButton from "./BatchDownloadButton";
import GenerationResultTile from "./GenerationResultTile";
import { IconImage } from "./Icons";
import "../styles/product-result-panel.css";

interface Props {
  platform: PlatformSpec | null;
  mode: ImageEditMode;
  activeKind: ImageEditKind;
  entries: Record<ImageEditKind, { item: GenerationItem; batchEntries: ImageEditBatchEntry[] }>;
  onRetry: (kind: ImageEditKind) => void;
  onDownload: (kind: ImageEditKind) => void;
  onRetryBatchItem: (kind: ImageEditKind, sourceImageId: string) => void;
  onDownloadBatchItem: (kind: ImageEditKind, sourceImageId: string) => void;
  onBatchDownload: (kind: ImageEditKind) => void;
}

export default function ImageEditResults({
  platform,
  mode,
  activeKind,
  entries,
  onRetry,
  onDownload,
  onRetryBatchItem,
  onDownloadBatchItem,
  onBatchDownload,
}: Props) {
  const spec = platform ? getImageEditSpec(activeKind, platform) : null;
  const label = IMAGE_EDIT_LABEL[activeKind];
  const activeEntry = entries[activeKind];
  const batchEntries = activeEntry.batchEntries;
  const batchCompletedCount = getImageEditBatchCompletedCount(batchEntries);
  const isBatch = mode === "batch";

  return (
    <div>
      <div className="results__head">
        <h2 className="section-heading" style={{ margin: 0 }}>
          {isBatch ? `${label}批量修改结果` : `${label}修改结果`}
        </h2>
        <span className="meta-row">
          <span>
            平台 <strong>{platform?.label ?? "未选择"}</strong>
          </span>
          {isBatch ? (
            <span>
              已完成 <strong>{batchCompletedCount}</strong> / {batchEntries.length || 0}
            </span>
          ) : null}
        </span>
        {isBatch ? (
          <BatchDownloadButton
            label="批量下载修改图"
            meta={`已完成 ${batchCompletedCount}/${batchEntries.length || 0}`}
            disabled={batchCompletedCount === 0 || !platform}
            onClick={() => onBatchDownload(activeKind)}
            title="批量下载已生成成功的修改图片"
          />
        ) : null}
      </div>
      {isBatch ? (
        batchEntries.length === 0 ? (
          <div className="result">
            <div className="result__body">
              <div className="result__placeholder">
                <IconImage style={{ width: 22, height: 22, color: "var(--fg-faint)" }} />
                <strong>上传多张{label}图片并填写修改要求后，即可批量逐张修改</strong>
                <span>最多一次 {IMAGE_EDIT_BATCH_MAX_IMAGES} 张，每张原图独立生成 1 张修改结果</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="product-batch-grid image-edit-batch-grid">
            {batchEntries.map((entry) => (
              <GenerationResultTile
                key={entry.sourceImageId}
                title={entry.productName}
                sub={entry.sourceName}
                item={entry.item}
                exportSize={spec?.exportLabel ?? "请选择平台"}
                idleMessage="开始批量修改后会在这里展示"
                compact
                onRetry={() => onRetryBatchItem(activeKind, entry.sourceImageId)}
                onDownload={() => onDownloadBatchItem(activeKind, entry.sourceImageId)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="results image-edit-results">
          <GenerationResultTile
            title={`${label}修改结果`}
            sub={spec?.sourceLabel ?? "请先选择投放平台"}
            item={activeEntry.item}
            exportSize={spec?.exportLabel ?? "请选择平台"}
            idleMessage={`上传${label}图片并填写修改要求后生成`}
            onRetry={() => onRetry(activeKind)}
            onDownload={() => onDownload(activeKind)}
          />
        </div>
      )}
    </div>
  );
}
