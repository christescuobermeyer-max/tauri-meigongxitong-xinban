import { useState } from "react";
import { type ImageEditKind } from "../lib/image-edit";
import type { GenerationItem, GenerationLine, Platform, PlatformSpec, UploadedImage } from "../types";
import GenerationLineCard from "./GenerationLineCard";
import ImageEditInputCard from "./ImageEditInputCard";
import ImageEditKindSelect from "./ImageEditKindSelect";
import ImageEditResults from "./ImageEditResults";
import PlatformSelect from "./PlatformSelect";

interface Entry {
  images: UploadedImage[];
  referenceImages: UploadedImage[];
  instruction: string;
  item: GenerationItem;
}

interface Props {
  shopName: string;
  setShopName: (value: string) => void;
  platform: Platform | null;
  setPlatform: (platform: Platform) => void;
  currentPlatform: PlatformSpec | null;
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  entries: Record<ImageEditKind, Entry>;
  busy: boolean;
  setImages: (kind: ImageEditKind, images: UploadedImage[]) => void;
  setReferenceImages: (kind: ImageEditKind, images: UploadedImage[]) => void;
  setInstruction: (kind: ImageEditKind, value: string) => void;
  onGenerate: (kind: ImageEditKind) => void;
  onDownload: (kind: ImageEditKind) => void;
}

export default function ImageEditPage({
  shopName,
  setShopName,
  platform,
  setPlatform,
  currentPlatform,
  generationLine,
  setGenerationLine,
  entries,
  busy,
  setImages,
  setReferenceImages,
  setInstruction,
  onGenerate,
  onDownload,
}: Props) {
  const [activeKind, setActiveKind] = useState<ImageEditKind>("avatar");
  const activeEntry = entries[activeKind];

  return (
    <>
      <div className="panel-stack">
        <GenerationLineCard value={generationLine} onChange={setGenerationLine} />
        <section className="card image-edit-card">
          <div className="card__header image-edit-card__header">
            <div className="card__heading">
              <div className="card__title">修改图片</div>
              <span className="card__hint">选择图片类型，上传原图并填写修改要求</span>
            </div>
            <ImageEditKindSelect value={activeKind} disabled={busy} onChange={setActiveKind} />
          </div>
          <div className="card__body image-edit-card__body">
            <div className="image-edit-meta-row">
              <div className="field">
                <label className="field__label">店铺名称</label>
                <input
                  className="input"
                  placeholder="用于归档、命名和辅助生成"
                  value={shopName}
                  onChange={(event) => setShopName(event.target.value)}
                  maxLength={40}
                />
              </div>
              <div className="field">
                <label className="field__label">投放平台</label>
                <PlatformSelect value={platform} onChange={setPlatform} />
                <span className="field__hint">按当前图片类型使用对应平台导出尺寸</span>
              </div>
            </div>
            <hr className="image-edit-divider" />
            <ImageEditInputCard
              kind={activeKind}
              platform={currentPlatform}
              images={activeEntry.images}
              referenceImages={activeEntry.referenceImages}
              instruction={activeEntry.instruction}
              busy={busy}
              onImagesChange={(images) => setImages(activeKind, images)}
              onReferenceImagesChange={(images) => setReferenceImages(activeKind, images)}
              onInstructionChange={(value) => setInstruction(activeKind, value)}
              onGenerate={() => onGenerate(activeKind)}
            />
          </div>
        </section>
      </div>
      <ImageEditResults
        platform={currentPlatform}
        activeKind={activeKind}
        entries={entries}
        onRetry={onGenerate}
        onDownload={onDownload}
      />
    </>
  );
}
