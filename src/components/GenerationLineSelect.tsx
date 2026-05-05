import type { GenerationLine } from "../types";

const LINES: Array<{ id: GenerationLine; label: string }> = [
  { id: "line1", label: "线路1" },
  { id: "line2", label: "线路2" },
  { id: "line3", label: "线路3" },
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
          data-active={value === line.id}
          onClick={() => onChange(line.id)}
          type="button"
        >
          {line.label}
        </button>
      ))}
    </div>
  );
}
