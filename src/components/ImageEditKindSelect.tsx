import { IMAGE_EDIT_KINDS, IMAGE_EDIT_LABEL, type ImageEditKind } from "../lib/image-edit";

interface Props {
  value: ImageEditKind;
  disabled?: boolean;
  onChange: (kind: ImageEditKind) => void;
}

export default function ImageEditKindSelect({ value, disabled = false, onChange }: Props) {
  return (
    <div className="segmented image-edit-kind-select" role="tablist" aria-label="修改图片类型">
      {IMAGE_EDIT_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          role="tab"
          className="segmented__item"
          data-active={value === kind}
          aria-selected={value === kind}
          disabled={disabled}
          onClick={() => onChange(kind)}
        >
          {IMAGE_EDIT_LABEL[kind]}
        </button>
      ))}
    </div>
  );
}
