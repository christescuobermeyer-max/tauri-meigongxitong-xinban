import { IconSparkles, IconStore, IconImage } from "./Icons";
import BrandStoryResults from "./BrandStoryResults";
import GenerationLineCard from "./GenerationLineCard";
import type { BrandStoryImageEntry } from "../lib/brand-story";
import type { BrandCopy, GenerationLine } from "../types";

interface Props {
  storeName: string;
  setStoreName: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  copy: BrandCopy | null;
  entries: BrandStoryImageEntry[];
  busy: boolean;
  textBusy: boolean;
  imagesBusy: boolean;
  phase: "idle" | "text" | "image" | "done";
  imageProgress: number;
  completedCount: number;
  onGenerate: () => void;
  onRetry: (index: number) => void;
  onDownload: () => void;
  onDownloadItem: (index: number) => void;
}

export default function BrandStoryPage({
  storeName,
  setStoreName,
  category,
  setCategory,
  generationLine,
  setGenerationLine,
  copy,
  entries,
  busy,
  textBusy,
  imagesBusy,
  phase,
  imageProgress,
  completedCount,
  onGenerate,
  onRetry,
  onDownload,
  onDownloadItem,
}: Props) {
  const trimmed = storeName.trim();
  const canGenerate =
    trimmed.length >= 2 &&
    trimmed.length <= 20 &&
    category.trim().length > 0 &&
    !busy;

  return (
    <>
      <div className="panel-stack">
        <GenerationLineCard value={generationLine} onChange={setGenerationLine} />
        <section className="card">
          <div className="card__header">
            <div className="card__heading">
              <div className="card__title">品牌故事</div>
              <span className="card__hint">
                生成 6 段品牌文案 + 5 张配图，云端归档至 OSS 与生图日志
              </span>
            </div>
          </div>
          <div className="card__body picture-wall-form">
            <div className="field">
              <label className="field__label">
                <IconStore style={{ width: 14, height: 14, marginRight: 6 }} />
                店铺名称
              </label>
              <input
                className="input"
                placeholder="例如：阿牛黄焖鸡米饭（火车站店）"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                maxLength={20}
                disabled={busy}
              />
              <span className="field__hint">2–20 个字符，会写入文案并用于 OSS 归档命名</span>
            </div>

            <div className="field">
              <label className="field__label">
                <IconImage style={{ width: 14, height: 14, marginRight: 6 }} />
                经营品类
              </label>
              <input
                className="input"
                placeholder="例如：黄焖鸡米饭 / 麻辣烫 / 火锅"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                maxLength={30}
                disabled={busy}
              />
              <span className="field__hint">用于文案与配图的品类提示</span>
            </div>

            <div className="picture-wall-actions">
              <button
                className="btn btn--primary btn--lg"
                disabled={!canGenerate}
                onClick={onGenerate}
              >
                <IconSparkles style={{ width: 14, height: 14 }} />
                {textBusy
                  ? "正在生成文案…"
                  : imagesBusy
                    ? `正在生成配图（${imageProgress}/${entries.length}）…`
                    : "生成品牌故事"}
              </button>
            </div>
          </div>
        </section>
      </div>

      <BrandStoryResults
        copy={copy}
        entries={entries}
        storeName={storeName}
        completedCount={completedCount}
        busy={busy}
        phase={phase}
        imageProgress={imageProgress}
        onRetry={onRetry}
        onDownload={onDownload}
        onDownloadItem={onDownloadItem}
      />
    </>
  );
}
