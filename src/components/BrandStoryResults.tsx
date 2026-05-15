import BatchDownloadButton from "./BatchDownloadButton";
import BrandStoryCopyBlock from "./BrandStoryCopyBlock";
import GenerationResultTile from "./GenerationResultTile";
import MerchantCopyCard from "./MerchantCopyCard";
import { IconImage } from "./Icons";
import {
  BRAND_STORY_STRATEGY_TEXT,
  formatBrandStoryExportSize,
  type BrandStoryImageEntry,
} from "../lib/brand-story";
import type { BrandCopy } from "../types";

interface Props {
  copy: BrandCopy | null;
  entries: BrandStoryImageEntry[];
  storeName: string;
  completedCount: number;
  busy: boolean;
  phase: "idle" | "text" | "image" | "done";
  imageProgress: number;
  onRetry: (index: number) => void;
  onDownload: () => void;
  onDownloadItem: (index: number) => void;
}

export default function BrandStoryResults({
  copy,
  entries,
  storeName,
  completedCount,
  busy,
  phase,
  imageProgress,
  onRetry,
  onDownload,
  onDownloadItem,
}: Props) {
  const canDownload = completedCount > 0 && !busy;
  const totalImages = entries.length;

  const statusText =
    phase === "text"
      ? "正在构思品牌文案…"
      : phase === "image"
        ? `正在生成配图（${imageProgress}/${totalImages}）…`
        : "";

  function renderImageEntry(entry: BrandStoryImageEntry, idx: number) {
    const exportSize = formatBrandStoryExportSize(entry);
    return (
      <div
        key={entry.index}
        className="brand-story-grid__cell"
        data-hero={idx === 0 ? "true" : "false"}
      >
        <GenerationResultTile
          title={`配图 ${entry.index}`}
          sub={`${entry.name} · ${entry.aspectRatio} · ${exportSize}`}
          item={entry.item}
          exportSize={exportSize}
          idleMessage="生成后会在这里展示该张配图"
          compact
          onRetry={() => onRetry(entry.index)}
          onDownload={() => onDownloadItem(entry.index)}
        />
      </div>
    );
  }

  return (
    <div className="brand-story-results">
      <div className="results__head">
        <h2 className="section-heading" style={{ margin: 0 }}>
          生成结果
        </h2>
        <span className="meta-row">
          <span>
            店铺 <strong>{storeName || "—"}</strong>
          </span>
          <span>
            已完成 <strong>{completedCount}</strong> / {totalImages}
          </span>
          {statusText ? (
            <span className="brand-story-results__status">{statusText}</span>
          ) : null}
        </span>
        <BatchDownloadButton
          label="批量下载配图"
          meta={`已完成 ${completedCount}/${totalImages}`}
          disabled={!canDownload}
          onClick={onDownload}
          title="批量下载已生成成功的品牌故事配图"
        />
      </div>

      {copy ? (
        <section className="card brand-story-copy-card">
          <div className="card__header">
            <div className="card__heading">
              <div className="card__title">品牌文案</div>
              <span className="card__hint">点击任一行即可复制对应内容</span>
            </div>
          </div>
          <div className="card__body">
            <BrandStoryCopyBlock copy={copy} />
          </div>
        </section>
      ) : (
        <section className="card brand-story-copy-card brand-story-copy-card--placeholder">
          <div className="card__body">
            <div className="result__placeholder">
              <IconImage style={{ width: 22, height: 22, color: "var(--fg-faint)" }} />
              <strong>点击「生成品牌故事」开始</strong>
              <span>系统会先生成 6 段品牌文案，再依次生成 5 张配图</span>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card__header">
          <div className="card__heading">
            <div className="card__title">视觉资产 · 5 张配图</div>
            <span className="card__hint">
              下载时按每张图的原项目比例拉伸或压缩，不裁剪画面内容
            </span>
          </div>
        </div>
        <div className="card__body">
          <div className="brand-story-grid">
            {entries.map(renderImageEntry)}
          </div>
        </div>
      </section>

      <MerchantCopyCard
        text={BRAND_STORY_STRATEGY_TEXT}
        successMessage="品牌故事战略价值文案已复制到剪贴板"
      />
    </div>
  );
}
