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
        </div>
        <GenerationLineSelect value={value} onChange={onChange} />
      </div>
      <div className="generation-line-card__notice">
        <div className="generation-line-card__notice-row" data-line="line1">
          <span className="generation-line-card__notice-label">线路1</span>
          <span className="generation-line-card__notice-engine">yunwu</span>
          <span className="generation-line-card__notice-text">王郡江 杨有淇 王涛 使用</span>
        </div>
        <div className="generation-line-card__notice-row" data-line="line2">
          <span className="generation-line-card__notice-label">线路2</span>
          <span className="generation-line-card__notice-engine">yunwu</span>
          <span className="generation-line-card__notice-text">王清月 袁丽妮 黄兆微 使用</span>
        </div>
        <div className="generation-line-card__notice-row" data-line="line3">
          <span className="generation-line-card__notice-label">线路3</span>
          <span className="generation-line-card__notice-engine">vectorengine</span>
          <span className="generation-line-card__notice-text">备用线路</span>
        </div>
        <div className="generation-line-card__notice-row" data-line="line4">
          <span className="generation-line-card__notice-label">线路4</span>
          <span className="generation-line-card__notice-engine">pockgo</span>
          <span className="generation-line-card__notice-text">备用线路</span>
        </div>
        <div className="generation-line-card__notice-row" data-line="line5">
          <span className="generation-line-card__notice-label">线路5</span>
          <span className="generation-line-card__notice-engine">APIMart</span>
          <span className="generation-line-card__notice-text">金牌线路</span>
        </div>
      </div>
    </section>
  );
}
