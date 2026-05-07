import type { DetailPageEntry } from "../lib/detail-page";
import { DETAIL_PAGE_EXPORT_SIZE, DETAIL_PAGE_GENERATION_SIZE } from "../lib/detail-page";
import type { GenerationLine, UploadedImage } from "../types";
import GenerationLineCard from "./GenerationLineCard";
import ImageUpload from "./ImageUpload";
import { IconSparkles } from "./Icons";
import DetailPageResults from "./DetailPageResults";

interface Props {
  shopName: string;
  setShopName: (value: string) => void;
  images: UploadedImage[];
  setImages: (images: UploadedImage[]) => void;
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  entries: DetailPageEntry[];
  completedCount: number;
  busy: boolean;
  onGenerate: () => void;
  onRetry: (pageIndex: number) => void;
  onDownload: () => void;
  onDownloadItem: (pageIndex: number) => void;
}

export default function DetailPagePage({
  shopName,
  setShopName,
  images,
  setImages,
  generationLine,
  setGenerationLine,
  entries,
  completedCount,
  busy,
  onGenerate,
  onRetry,
  onDownload,
  onDownloadItem,
}: Props) {
  const canGenerate = shopName.trim().length > 0 && images.length === 1 && !busy;

  return (
    <>
      <div className="panel-stack">
        <GenerationLineCard value={generationLine} onChange={setGenerationLine} />
        <section className="card">
          <div className="card__header">
            <div className="card__heading">
              <div className="card__title">详情页生成</div>
              <span className="card__hint">上传 1 张产品图，生成 3 张电商详情页展示图</span>
            </div>
          </div>
          <div className="card__body picture-wall-form">
            <div className="field">
              <label className="field__label">店铺名称</label>
              <input
                className="input"
                placeholder="例如：韩大叔炸鸡拌饭"
                value={shopName}
                onChange={(event) => setShopName(event.target.value)}
                maxLength={40}
              />
              <span className="field__hint">会写入详情页画面并用于 OSS 归档命名</span>
            </div>

            <div className="field">
              <label className="field__label">产品图片</label>
              <ImageUpload
                images={images}
                onChange={setImages}
                maxCount={1}
                dropzoneTitle="点击、拖拽或 Ctrl+V 粘贴 1 张详情页产品图"
                compressedLabel="详情页参考图"
                showProductName
              />
              <span className="field__hint">
                模型生成尺寸 {DETAIL_PAGE_GENERATION_SIZE}，下载尺寸 {DETAIL_PAGE_EXPORT_SIZE.w}×{DETAIL_PAGE_EXPORT_SIZE.h}
              </span>
            </div>

            <div className="picture-wall-actions">
              <button className="btn btn--primary btn--lg" disabled={!canGenerate} onClick={onGenerate}>
                <IconSparkles style={{ width: 14, height: 14 }} />
                {busy ? "生成中…" : "生成详情页"}
              </button>
            </div>
          </div>
        </section>
      </div>

        <DetailPageResults
          entries={entries}
          shopName={shopName}
          completedCount={completedCount}
          busy={busy}
          onRetry={onRetry}
          onDownload={onDownload}
          onDownloadItem={onDownloadItem}
        />
      </>
  );
}
