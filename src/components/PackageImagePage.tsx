import { getPlatform } from "../lib/platforms";
import type { GenerationItem, Platform, PlatformSpec, UploadedImage } from "../types";
import GenerationLineCard from "./GenerationLineCard";
import GenerationResultTile from "./GenerationResultTile";
import ImageUpload from "./ImageUpload";
import { IconDownload, IconSparkles } from "./Icons";
import PlatformSelect from "./PlatformSelect";
import ProgressSteps from "./ProgressSteps";

interface Props {
  shopName: string;
  setShopName: (value: string) => void;
  platform: Platform | null;
  setPlatform: (value: Platform) => void;
  currentPlatform: PlatformSpec | null;
  images: UploadedImage[];
  setImages: (images: UploadedImage[]) => void;
  styleImages: UploadedImage[];
  setStyleImages: (images: UploadedImage[]) => void;
  productNames: string[];
  item: GenerationItem;
  busy: boolean;
  submitDisabled?: boolean;
  elapsed: number;
  onGenerate: () => void;
  onRetry: () => void;
  onDownload: () => void;
}

export default function PackageImagePage({
  shopName,
  setShopName,
  platform,
  setPlatform,
  currentPlatform,
  images,
  setImages,
  styleImages,
  setStyleImages,
  productNames,
  item,
  busy,
  submitDisabled = busy,
  elapsed,
  onGenerate,
  onRetry,
  onDownload,
}: Props) {
  const platformSpec = platform ? getPlatform(platform) : null;
  const source = platformSpec?.product.source;
  const target = platformSpec?.product.export;
  const canSubmit = Boolean(platform) && styleImages.length > 0 && images.length > 0 && !submitDisabled;
  const fileHint = platformSpec?.product.maxBytes
    ? ` · JPG 不超过 ${Math.floor(platformSpec.product.maxBytes / 1024)}KB`
    : "";

  return (
    <>
      <div className="panel-stack">
        <GenerationLineCard />
        <section className="card">
          <div className="card__header">
            <div className="card__heading">
              <div className="card__title">制作套餐图</div>
              <span className="card__hint">1 张参考设计风格图 + 最多 4 张产品图，自动合成一张套餐图</span>
            </div>
          </div>

          <div className="card__body">
            <div className="field">
              <label className="field__label">店铺名称（可选）</label>
              <input
                className="input"
                placeholder="用于归档命名，也会辅助画面文字"
                value={shopName}
                onChange={(event) => setShopName(event.target.value)}
                maxLength={40}
              />
            </div>

            <div className="field">
              <label className="field__label">投放平台</label>
              <PlatformSelect value={platform} onChange={setPlatform} />
              <span className="field__hint">
                {currentPlatform
                  ? `原图 ${source?.w}×${source?.h} · 导出 ${target?.w}×${target?.h}${fileHint}`
                  : "请选择美团或淘宝闪购，系统会按平台产品图尺寸生成套餐图"}
              </span>
            </div>

            <div className="field">
              <label className="field__label">参考设计风格图</label>
              <ImageUpload
                images={styleImages}
                onChange={setStyleImages}
                maxCount={1}
                dropzoneTitle="点击、拖拽或 Ctrl+V 粘贴 1 张参考设计风格图"
                compressedLabel="风格参考总"
              />
              <span className="field__hint">第 1 张传给系统的参考图，用来决定背景、版式、配色和文案排版风格</span>
            </div>

            <div className="field">
              <label className="field__label">套餐产品图</label>
              <ImageUpload
                images={images}
                onChange={setImages}
                maxCount={4}
                dropzoneTitle="点击、拖拽或 Ctrl+V 粘贴 1-4 张套餐产品图"
                compressedLabel="套餐产品参考总"
                showProductName
              />
              <span className="field__hint">无需手动输入描述文字；系统会把所有上传产品图融入同一张套餐图</span>
            </div>

            <div className="field">
              <label className="field__label">已识别产品名称</label>
              <div className="product-name-list">
                {productNames.length > 0 ? (
                  productNames.map((name) => <span className="product-name-chip" key={name}>{name}</span>)
                ) : (
                  <span className="field__hint">上传套餐产品图后会按文件名自动提取产品名称</span>
                )}
              </div>
            </div>

            <button className="btn btn--primary btn--block btn--lg" disabled={!canSubmit} onClick={onGenerate}>
              <IconSparkles style={{ width: 14, height: 14 }} />
              {busy ? "制作中…" : "开始制作套餐图"}
            </button>
            {busy ? (
              <ProgressSteps elapsedMs={elapsed} steps={[{ index: 1, label: "套餐图", item }]} />
            ) : null}
          </div>
        </section>
      </div>

      <div>
        <div className="results__head">
          <h2 className="section-heading" style={{ margin: 0 }}>生成结果</h2>
          <button className="batch-download-btn" disabled={item.status !== "succeeded"} onClick={onDownload}>
            <span className="batch-download-btn__icon">
              <IconDownload style={{ width: 15, height: 15 }} />
            </span>
            <span className="batch-download-btn__label">下载套餐图</span>
          </button>
        </div>
        <div className="results">
          <GenerationResultTile
            title="套餐图"
            sub={source ? `原图 ${source.w}×${source.h}` : "请先选择投放平台"}
            item={item}
            exportSize={target ? `${target.w}×${target.h}` : "请选择平台"}
            idleMessage="上传参考图和套餐产品图后，点击「开始制作套餐图」"
            onRetry={onRetry}
            onDownload={onDownload}
          />
        </div>
      </div>
    </>
  );
}
