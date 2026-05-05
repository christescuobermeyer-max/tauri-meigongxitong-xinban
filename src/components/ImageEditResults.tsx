import { getImageEditSpec, IMAGE_EDIT_KINDS, IMAGE_EDIT_LABEL, type ImageEditKind } from "../lib/image-edit";
import type { GenerationItem, PlatformSpec } from "../types";
import GenerationResultTile from "./GenerationResultTile";

interface Props {
  platform: PlatformSpec;
  entries: Record<ImageEditKind, { item: GenerationItem }>;
  onRetry: (kind: ImageEditKind) => void;
  onDownload: (kind: ImageEditKind) => void;
}

export default function ImageEditResults({ platform, entries, onRetry, onDownload }: Props) {
  return (
    <div>
      <div className="results__head">
        <h2 className="section-heading" style={{ margin: 0 }}>
          修改结果
        </h2>
        <span className="meta-row">
          <span>
            平台 <strong>{platform.label}</strong>
          </span>
        </span>
      </div>
      <div className="results image-edit-results">
        {IMAGE_EDIT_KINDS.map((kind) => {
          const spec = getImageEditSpec(kind, platform);
          const label = IMAGE_EDIT_LABEL[kind];
          return (
            <GenerationResultTile
              key={kind}
              title={`${label}修改结果`}
              sub={spec.sourceLabel}
              item={entries[kind].item}
              exportSize={spec.exportLabel}
              idleMessage={`上传${label}图片并填写修改要求后生成`}
              onRetry={() => onRetry(kind)}
              onDownload={() => onDownload(kind)}
            />
          );
        })}
      </div>
    </div>
  );
}
