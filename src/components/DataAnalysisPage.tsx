import GenerationLineCard from "./GenerationLineCard";
import GenerationResultTile from "./GenerationResultTile";
import ImageUpload from "./ImageUpload";
import MerchantCopyCard from "./MerchantCopyCard";
import { IconCheck, IconImage, IconSparkles, IconStore } from "./Icons";
import { DATA_ANALYSIS_COPY_TEXT, DATA_ANALYSIS_EXPORT_SIZE } from "../lib/data-analysis";
import type { GenerationItem, UploadedImage } from "../types";

interface Props {
  storeName: string;
  setStoreName: (value: string) => void;
  images: UploadedImage[];
  setImages: (images: UploadedImage[]) => void;
  item: GenerationItem;
  busy: boolean;
  submitDisabled?: boolean;
  onGenerate: () => void;
  onRetry: () => void;
  onDownload: () => void;
}

export default function DataAnalysisPage({
  storeName,
  setStoreName,
  images,
  setImages,
  item,
  busy,
  submitDisabled = busy,
  onGenerate,
  onRetry,
  onDownload,
}: Props) {
  const canGenerate = Boolean(storeName.trim()) && images.length === 1 && !submitDisabled;

  return (
    <>
      <div className="panel-stack">
        <GenerationLineCard />
        <section className="card">
          <div className="card__header">
            <div className="card__heading">
              <div className="card__title">数据分析</div>
              <span className="card__hint">
                上传店铺 30 天流量截图，生成可直接发给商家的专业分析图
              </span>
            </div>
          </div>
          <div className="card__body picture-wall-form">
            <div className="field">
              <label className="field__label">
                <IconStore style={{ width: 14, height: 14 }} />
                店铺名称
              </label>
              <input
                className="input"
                placeholder="例如：山饺下（饿了么）"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                disabled={busy}
              />
              <span className="field__hint">会写入生成图标题和下载文件名</span>
            </div>

            <div className="field">
              <label className="field__label">
                <IconImage style={{ width: 14, height: 14 }} />
                店铺数据截图
              </label>
              <ImageUpload
                images={images}
                onChange={(next) => setImages(next.slice(0, 1))}
                maxCount={1}
                dropzoneTitle="点击、拖拽或 Ctrl+V 粘贴店铺30天流量数据截图"
                compressedLabel="生图参考"
              />
              <span className="field__hint">
                仅使用这张截图作为参考图，不携带旧项目模板图
              </span>
            </div>

            <div className="picture-wall-actions">
              <button
                className="btn btn--primary btn--lg"
                disabled={!canGenerate}
                onClick={onGenerate}
                type="button"
              >
                <IconSparkles style={{ width: 14, height: 14 }} />
                {busy ? "正在生成分析图…" : "生成数据分析图"}
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="results">
        <div className="data-analysis-result-hero">
          <div className="data-analysis-result-hero__main">
            <div className="data-analysis-result-hero__icon">
              <IconSparkles style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <div className="data-analysis-result-hero__kicker">专业分析交付区</div>
              <div className="data-analysis-result-hero__title">生成结果</div>
              <div className="data-analysis-result-hero__subtitle">
                生成后可下载 {DATA_ANALYSIS_EXPORT_SIZE.w}×{DATA_ANALYSIS_EXPORT_SIZE.h} 分析图
              </div>
            </div>
          </div>
          <div className="data-analysis-result-hero__metrics" aria-label="数据分析图交付能力">
            <span className="data-analysis-result-hero__metric">
              <IconCheck style={{ width: 12, height: 12 }} />
              高清下载
            </span>
            <span className="data-analysis-result-hero__metric">
              <IconCheck style={{ width: 12, height: 12 }} />
              OSS归档
            </span>
            <span className="data-analysis-result-hero__metric">
              <IconCheck style={{ width: 12, height: 12 }} />
              云端记录
            </span>
          </div>
        </div>
        <GenerationResultTile
          title="数据分析图"
          sub="30天流量截图分析"
          item={item}
          exportSize={`${DATA_ANALYSIS_EXPORT_SIZE.w}×${DATA_ANALYSIS_EXPORT_SIZE.h}`}
          idleMessage="上传截图并点击生成后，分析图会显示在这里"
          onRetry={onRetry}
          onDownload={onDownload}
        />
        {item.status === "succeeded" ? (
          <MerchantCopyCard
            text={DATA_ANALYSIS_COPY_TEXT}
            successMessage="数据分析沟通话术已复制到剪贴板"
          />
        ) : null}
      </div>
    </>
  );
}
