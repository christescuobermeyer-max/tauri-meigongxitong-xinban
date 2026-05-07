import { getImageEditSpec, IMAGE_EDIT_LABEL, type ImageEditKind } from "../lib/image-edit";
import type { GenerationItem, PlatformSpec } from "../types";
import GenerationResultTile from "./GenerationResultTile";

interface Props {
  platform: PlatformSpec | null;
  activeKind: ImageEditKind;
  entries: Record<ImageEditKind, { item: GenerationItem }>;
  onRetry: (kind: ImageEditKind) => void;
  onDownload: (kind: ImageEditKind) => void;
}

export default function ImageEditResults({
  platform,
  activeKind,
  entries,
  onRetry,
  onDownload,
}: Props) {
  const spec = platform ? getImageEditSpec(activeKind, platform) : null;
  const label = IMAGE_EDIT_LABEL[activeKind];
  const activeEntry = entries[activeKind];

  return (
    <div>
      <div className="results__head">
        <h2 className="section-heading" style={{ margin: 0 }}>
          {label}修改结果
        </h2>
        <span className="meta-row">
          <span>
            平台 <strong>{platform?.label ?? "未选择"}</strong>
          </span>
        </span>
      </div>
      <div className="results image-edit-results">
        <GenerationResultTile
          title={`${label}修改结果`}
          sub={spec?.sourceLabel ?? "请先选择投放平台"}
          item={activeEntry.item}
          exportSize={spec?.exportLabel ?? "请选择平台"}
          idleMessage={`上传${label}图片并填写修改要求后生成`}
          onRetry={() => onRetry(activeKind)}
          onDownload={() => onDownload(activeKind)}
        />
      </div>
    </div>
  );
}
