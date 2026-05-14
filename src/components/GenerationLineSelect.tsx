import type { GenerationLine } from "../types";

const LINES: Array<{ id: GenerationLine; label: string; disabled?: boolean }> = [
  { id: "line1", label: "线路1", disabled: true },
  { id: "line2", label: "线路2" },
  { id: "line3", label: "线路3" },
  { id: "line4", label: "线路4" },
  { id: "line5", label: "线路5" },
];

interface Props {
  value: GenerationLine;
  onChange: (value: GenerationLine) => void;
}

export default function GenerationLineSelect({ value, onChange }: Props) {
  return (
    <div className="segmented" role="tablist" aria-label="生图线路">
      {LINES.map((line) => (
        <button
          key={line.id}
          role="tab"
          className="segmented__item"
          data-line={line.id}
          data-active={value === line.id}
          disabled={line.disabled}
          title={line.disabled ? "线路1已停用，请使用线路5" : undefined}
          aria-label={line.disabled ? "线路1已停用，请使用线路5" : line.label}
          onClick={() => {
            if (line.disabled) return;
            onChange(line.id);
          }}
          type="button"
        >
          {line.label}
        </button>
      ))}
    </div>
  );
}
