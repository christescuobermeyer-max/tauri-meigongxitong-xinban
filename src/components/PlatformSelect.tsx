import { PLATFORMS } from "../lib/platforms";
import type { Platform } from "../types";

interface Props {
  value: Platform;
  onChange: (v: Platform) => void;
}

export default function PlatformSelect({ value, onChange }: Props) {
  return (
    <div className="segmented" role="tablist" aria-label="平台">
      {PLATFORMS.map((p) => (
        <button
          key={p.id}
          role="tab"
          className="segmented__item"
          data-active={value === p.id}
          onClick={() => onChange(p.id)}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: 999,
              background: p.swatch,
              marginRight: 6,
              verticalAlign: "middle",
            }}
          />
          {p.label}
        </button>
      ))}
    </div>
  );
}
