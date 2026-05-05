import { IMAGE_EDIT_KINDS, type ImageEditKind } from "../lib/image-edit";
import type { GenerationItem, GenerationLine, Platform, PlatformSpec, UploadedImage } from "../types";
import GenerationLineCard from "./GenerationLineCard";
import ImageEditInputCard from "./ImageEditInputCard";
import ImageEditResults from "./ImageEditResults";
import PlatformSelect from "./PlatformSelect";

interface Entry {
  images: UploadedImage[];
  instruction: string;
  item: GenerationItem;
}

interface Props {
  shopName: string;
  setShopName: (value: string) => void;
  platform: Platform;
  setPlatform: (platform: Platform) => void;
  currentPlatform: PlatformSpec;
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  entries: Record<ImageEditKind, Entry>;
  busy: boolean;
  setImages: (kind: ImageEditKind, images: UploadedImage[]) => void;
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
  setInstruction,
  onGenerate,
  onDownload,
}: Props) {
  return (
    <>
      <div className="panel-stack">
        <GenerationLineCard value={generationLine} onChange={setGenerationLine} />
        <section className="card">
          <div className="card__header">
            <div className="card__heading">
              <div className="card__title">修改图片</div>
              <span className="card__hint">上传原图并填写修改要求，按原工具尺寸重新生成</span>
            </div>
          </div>
          <div className="card__body image-edit-settings">
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
              <span className="field__hint">头像、店招、海报和产品图会使用对应平台的导出尺寸</span>
            </div>
          </div>
        </section>
        {IMAGE_EDIT_KINDS.map((kind) => (
          <ImageEditInputCard
            key={kind}
            kind={kind}
            platform={currentPlatform}
            images={entries[kind].images}
            instruction={entries[kind].instruction}
            busy={busy}
            onImagesChange={(images) => setImages(kind, images)}
            onInstructionChange={(value) => setInstruction(kind, value)}
            onGenerate={() => onGenerate(kind)}
          />
        ))}
      </div>
      <ImageEditResults
        platform={currentPlatform}
        entries={entries}
        onRetry={onGenerate}
        onDownload={onDownload}
      />
    </>
  );
}
