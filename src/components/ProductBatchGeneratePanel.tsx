import { useState } from "react";
import type { GenerationLine, Platform, UploadedImage } from "../types";
import type { ProductBatchEntry } from "../lib/product-batch";
import { getPlatform } from "../lib/platforms";
import { buildProductBatchPrompt } from "../lib/prompts";
import PlatformSelect from "./PlatformSelect";
import GenerationLineCard from "./GenerationLineCard";
import ImageUpload from "./ImageUpload";
import { IconSparkles } from "./Icons";
import PromptPreview from "./PromptPreview";
import ProgressSteps from "./ProgressSteps";

interface Props {
  shopName: string;
  setShopName: (value: string) => void;
  platform: Platform;
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
  const platformSpec = getPlatform(platform);
  const [showPrompt, setShowPrompt] = useState(false);
  const batchBusy = entries.some((entry) => entry.item.status === "queued" || entry.item.status === "running");
  const canSubmit = shopName.trim().length > 0 && images.length > 0 && styleImages.length > 0 && !busy;
  const source = platformSpec.product.source;
  const target = platformSpec.product.export;
  const fileHint = platformSpec.product.maxBytes
    ? ` · JPG 不超过 ${Math.floor(platformSpec.product.maxBytes / 1024)}KB`
    : "";
  const previewProductName = entries[0]?.productName || images[0]?.productName?.trim() || "{产品名称}";

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
              原图 {source.w}×{source.h} · 导出 {target.w}×{target.h}
              {fileHint}
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
              这里上传“制作1张设计图”的成图。生成时它会作为第 1 张传给系统的参考图，用来统一整套全店图的视觉风格
            </span>
          </div>

          <div className="field">
            <label className="field__label">产品图（参考素材）</label>
            <ImageUpload images={images} onChange={setImages} maxCount={10} />
            <span className="field__hint">最多一次上传 10 张产品图。每次生成时当前产品图会作为第 2 张传给系统的参考图</span>
          </div>

          <div className="field">
            <label className="field__label">
              生成提示词
              <button
                className="btn btn--link"
                onClick={() => setShowPrompt((value) => !value)}
                type="button"
              >
                {showPrompt ? "收起" : "查看"}
              </button>
            </label>
            {showPrompt && (
              <PromptPreview
                title={`全店图 prompt · ${source.w}×${source.h}`}
                text={buildProductBatchPrompt(shopName || "{店铺名称}", previewProductName, platform)}
              />
            )}
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
