import {
  getImageEditSourceMaxCount,
  getImageEditSpec,
  IMAGE_EDIT_LABEL,
  type ImageEditKind,
} from "../lib/image-edit";
import type { PlatformSpec, UploadedImage } from "../types";
import ImageUpload from "./ImageUpload";
import { IconSparkles } from "./Icons";

interface Props {
  kind: ImageEditKind;
  platform: PlatformSpec | null;
  images: UploadedImage[];
  referenceImages: UploadedImage[];
  instruction: string;
  busy: boolean;
  submitDisabled?: boolean;
  onImagesChange: (images: UploadedImage[]) => void;
  onReferenceImagesChange: (images: UploadedImage[]) => void;
  onInstructionChange: (value: string) => void;
  onGenerate: () => void;
}

export default function ImageEditInputCard({
  kind,
  platform,
  images,
  referenceImages,
  instruction,
  busy,
  submitDisabled = busy,
  onImagesChange,
  onReferenceImagesChange,
  onInstructionChange,
  onGenerate,
}: Props) {
  const label = IMAGE_EDIT_LABEL[kind];
  const spec = platform ? getImageEditSpec(kind, platform) : null;
  const sourceMaxCount = getImageEditSourceMaxCount(kind);
  const sourceCountText = kind === "product" ? "1-4 张" : "1 张";
  const canGenerate = Boolean(platform) && images.length > 0 && instruction.trim().length > 0 && !submitDisabled;

  return (
    <div className="image-edit-form">
      <div className="image-edit-active-meta">
        <span>{spec ? spec.sourceLabel : "请先选择投放平台"}</span>
        <span>{spec ? `导出 ${spec.exportLabel}` : "选择后显示对应导出尺寸"}</span>
      </div>
      <div className="field">
        <label className="field__label">{spec ? spec.uploadTitle : `${label}图片`}</label>
        <ImageUpload
          images={images}
          onChange={onImagesChange}
          maxCount={sourceMaxCount}
          dropzoneTitle={`点击、拖拽或 Ctrl+V 粘贴 ${sourceCountText}${label}图片`}
          compressedLabel={`${label}参考图`}
          showProductName={kind === "product"}
        />
        {kind === "product" ? (
          <span className="field__hint">最多上传 4 张产品图，可把套餐内多个产品融入同一张图</span>
        ) : null}
      </div>
      <div className="field">
        <label className="field__label">参考图（可选）</label>
        <ImageUpload
          images={referenceImages}
          onChange={onReferenceImagesChange}
          maxCount={1}
          dropzoneTitle={`可选：点击、拖拽或 Ctrl+V 粘贴 1 张${label}参考图`}
          compressedLabel={`${label}可选参考图`}
        />
        <span className="field__hint">没有参考图可留空；上传后会随原图一起作为生成参考</span>
      </div>
      <div className="field">
        <label className="field__label">修改要求</label>
        <textarea
          className="textarea"
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder={`写清楚要如何调整这张${label}，例如：保持主体不变，增强背景氛围，替换文字为...`}
          maxLength={300}
        />
        <span className="field__hint">会严格参考上传图片，只按这里的文字要求修改</span>
      </div>
      <button className="btn btn--primary btn--block" disabled={!canGenerate} onClick={onGenerate}>
        <IconSparkles style={{ width: 14, height: 14 }} />
        {busy ? "修改中…" : `开始修改${label}`}
      </button>
    </div>
  );
}
