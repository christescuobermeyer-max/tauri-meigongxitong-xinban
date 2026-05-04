import type { GenerationLine } from "../types";
import GenerationLineSelect from "./GenerationLineSelect";

interface Props {
  value: GenerationLine;
  onChange: (value: GenerationLine) => void;
}

export default function GenerationLineCard({ value, onChange }: Props) {
  return (
    <section className="card generation-line-card">
      <div className="generation-line-card__main">
        <div className="generation-line-card__copy">
          <div className="generation-line-card__title">生图线路</div>
          <span className="generation-line-card__hint">线路1为yunwu 接口，线路2为 pockgo 接口</span>
        </div>
        <GenerationLineSelect value={value} onChange={onChange} />
      </div>
      <div className="generation-line-card__notice">
        <span>线路1（王郡江 杨有淇 王涛）使用</span>
        <span>线路2（王清月 袁丽妮 黄兆微）使用</span>
      </div>
    </section>
  );
}
