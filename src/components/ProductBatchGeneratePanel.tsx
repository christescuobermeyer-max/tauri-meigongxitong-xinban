import type { GenerationLine, Platform, UploadedImage } from "../types";
import type { ProductBatchEntry } from "../lib/product-batch";
import { getPlatform } from "../lib/platforms";
import PlatformSelect from "./PlatformSelect";
import GenerationLineCard from "./GenerationLineCard";
import ImageUpload from "./ImageUpload";
import { IconSparkles } from "./Icons";
import ProgressSteps from "./ProgressSteps";

interface Props {
  shopName: string;
  setShopName: (value: string) => void;
  platform: Platform | null;
  setPlatform: (value: Platform) => void;
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  images: UploadedImage[];
  setImages: (images: UploadedImage[]) => void;
  styleImages: UploadedImage[];
  setStyleImages: (images: UploadedImage[]) => void;
  entries: ProductBatchEntry[];
  onGenerate: () => void;
  busy: boolean;
  elapsed: number;
}

export default function ProductBatchGeneratePanel({
  shopName,
  setShopName,
  platform,
  setPlatform,
  generationLine,
  setGenerationLine,
  images,
  setImages,
  styleImages,
  setStyleImages,
  entries,
  onGenerate,
  busy,
  elapsed,
}: Props) {
  const platformSpec = platform ? getPlatform(platform) : null;
  const batchBusy = entries.some((entry) => entry.item.status === "queued" || entry.item.status === "running");
  const canSubmit = Boolean(platform) && shopName.trim().length > 0 && images.length > 0 && styleImages.length > 0 && !busy;
  const source = platformSpec?.product.source;
  const target = platformSpec?.product.export;
  const fileHint = platformSpec?.product.maxBytes
    ? ` · JPG 不超过 ${Math.floor(platformSpec.product.maxBytes / 1024)}KB`
    : "";

  return (
    <div className="panel-stack">
      <GenerationLineCard value={generationLine} onChange={setGenerationLine} />
      <div className="card">
        <div className="card__header">
          <div className="card__heading">
            <div className="card__title">制作全店图</div>
            <span className="card__hint">参考设计风格图，最多一次批量制作 10 张全店产品图</span>
          </div>
        </div>

        <div className="card__body">
          <div className="field">
            <label className="field__label">店铺名称</label>
            <input
              className="input"
              placeholder="例如：阿牛黄焖鸡米饭（火车站店）"
              value={shopName}
              onChange={(event) => setShopName(event.target.value)}
              maxLength={40}
            />
            <span className="field__hint">会延续店铺名气质，让全店图风格更统一</span>
          </div>

          <div className="field">
            <label className="field__label">投放平台</label>
            <PlatformSelect value={platform} onChange={setPlatform} />
            <span className="field__hint">
              {platformSpec ?
                `原图 ${source?.w}×${source?.h} · 导出 ${target?.w}×${target?.h}${fileHint}` :
                "请先选择美团或淘宝闪购，系统会按所选平台批量生成对应尺寸"}
            </span>
          </div>

          <div className="field">
            <label className="field__label">产品名称</label>
            <div className="product-name-list">
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <span className="product-name-chip" key={entry.sourceImageId}>
                    {entry.productName}
                  </span>
                ))
              ) : (
                <span className="field__hint">上传产品图后会按各文件名自动提取产品名称</span>
              )}
            </div>
            <span className="field__hint">生成时会把各产品名称分别替换到对应的全店图文案中</span>
          </div>

          <div className="field">
            <label className="field__label">参考设计风格图</label>
            <ImageUpload
              images={styleImages}
              onChange={setStyleImages}
              maxCount={1}
              dropzoneTitle="点击、拖拽或 Ctrl+V 粘贴参考设计风格图至此"
              compressedLabel="风格参考总"
            />
            <span className="field__hint">
              这里上传“制作1张设计图”的成图。每次生成只发送 1 张参考设计风格图 + 当前这一张产品图；这里的第 1 张传给系统的参考图是参考设计风格图，不是产品图列表的第 1 张、第 2 张
            </span>
          </div>

          <div className="field">
            <label className="field__label">产品图（参考素材）</label>
            <ImageUpload images={images} onChange={setImages} maxCount={10} />
            <span className="field__hint">最多一次上传 10 张产品图。系统会逐张生成，每次只取当前这一张产品图作为第 2 张参考图</span>
          </div>

          <div style={{ marginTop: 18 }}>
            <button
              className="btn btn--primary btn--block btn--lg"
              disabled={!canSubmit}
              onClick={onGenerate}
            >
              <IconSparkles style={{ width: 14, height: 14 }} />
              {busy ? "制作中…" : "开始制作全店图"}
            </button>
            {batchBusy && entries.length > 0 && (
              <ProgressSteps
                elapsedMs={elapsed}
                steps={entries.map((entry, index) => ({
                  index: index + 1,
                  label: entry.productName,
                  item: entry.item,
                }))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
