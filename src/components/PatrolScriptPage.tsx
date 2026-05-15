import { useMemo, useState } from "react";
import GenerationLineCard from "./GenerationLineCard";
import GenerationResultTile from "./GenerationResultTile";
import { IconCheck, IconSparkles, IconStore } from "./Icons";
import { PATROL_SCRIPT_EXPORT_SIZE } from "../lib/patrol-script";
import { PATROL_SCRIPTS, type PatrolScript } from "../lib/patrol-scripts";
import type { GenerationItem, GenerationLine } from "../types";

interface Props {
  storeName: string;
  setStoreName: (value: string) => void;
  scriptId: number;
  setScriptId: (id: number) => void;
  selectedScript: PatrolScript;
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  item: GenerationItem;
  busy: boolean;
  onGenerate: () => void;
  onRetry: () => void;
  onCopyScript: (script: PatrolScript) => void;
  onDownload: () => void;
}

export default function PatrolScriptPage({
  storeName,
  setStoreName,
  scriptId,
  setScriptId,
  selectedScript,
  generationLine,
  setGenerationLine,
  item,
  busy,
  onGenerate,
  onRetry,
  onCopyScript,
  onDownload,
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return PATROL_SCRIPTS;
    return PATROL_SCRIPTS.filter((s) => {
      return (
        String(s.id).includes(keyword) ||
        s.title.toLowerCase().includes(keyword) ||
        s.content.toLowerCase().includes(keyword)
      );
    });
  }, [search]);

  const canGenerate = Boolean(storeName.trim()) && Boolean(selectedScript) && !busy;

  return (
    <>
      <div className="panel-stack">
        <GenerationLineCard value={generationLine} onChange={setGenerationLine} />
        <section className="card">
          <div className="card__header">
            <div className="card__heading">
              <div className="card__title">巡店话术</div>
              <span className="card__hint">
                选择一条每日群发话术 + 填入店铺名称，生成可发送到运营群的知识卡片
              </span>
            </div>
          </div>
          <div className="card__body picture-wall-form">
            <div className="field">
              <label className="field__label">
                <IconStore style={{ width: 14, height: 14 }} />
                店铺名称
              </label>
              <input
                className="input"
                placeholder="例如：山饺下（饿了么）"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                disabled={busy}
              />
              <span className="field__hint">会出现在卡片左上角，并写入历史记录</span>
            </div>

            <div className="field">
              <label className="field__label">
                <IconSparkles style={{ width: 14, height: 14 }} />
                选择巡店话术
              </label>
              <input
                className="input"
                placeholder="按编号 / 标题 / 关键字搜索 50 条话术"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={busy}
              />
              <div className="patrol-script-list" role="listbox" aria-label="巡店话术列表">
                {filtered.length === 0 ? (
                  <div className="patrol-script-list__empty">未找到匹配的话术</div>
                ) : (
                  filtered.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="patrol-script-list__item"
                      data-active={s.id === scriptId ? "true" : undefined}
                      title={s.id === scriptId ? "点击话术可复制正文" : "点击选择话术"}
                      onClick={() => {
                        if (s.id === scriptId) {
                          onCopyScript(s);
                          return;
                        }
                        setScriptId(s.id);
                      }}
                      disabled={busy}
                    >
                      <span className="patrol-script-list__id">话术 {s.id}</span>
                      <span className="patrol-script-list__title">{s.title}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="patrol-script-preview">
                <div className="patrol-script-preview__head">
                  当前选中：话术 {selectedScript.id} · {selectedScript.title}
                </div>
                <button
                  type="button"
                  className="patrol-script-preview__body"
                  title="点击复制当前话术正文"
                  onClick={() => onCopyScript(selectedScript)}
                >
                  {selectedScript.content}
                </button>
              </div>
            </div>

            <div className="picture-wall-actions">
              <button
                className="btn btn--primary btn--lg"
                disabled={!canGenerate}
                onClick={onGenerate}
                type="button"
              >
                <IconSparkles style={{ width: 14, height: 14 }} />
                {busy ? "正在生成话术卡片…" : "生成巡店话术卡片"}
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="results">
        <div className="data-analysis-result-hero">
          <div className="data-analysis-result-hero__main">
            <div className="data-analysis-result-hero__icon">
              <IconSparkles style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <div className="data-analysis-result-hero__kicker">巡店话术交付区</div>
              <div className="data-analysis-result-hero__title">生成结果</div>
              <div className="data-analysis-result-hero__subtitle">
                生成后可下载 {PATROL_SCRIPT_EXPORT_SIZE.w}×{PATROL_SCRIPT_EXPORT_SIZE.h} 知识卡片
              </div>
            </div>
          </div>
          <div className="data-analysis-result-hero__metrics" aria-label="巡店话术交付能力">
            <span className="data-analysis-result-hero__metric">
              <IconCheck style={{ width: 12, height: 12 }} />
              高清下载
            </span>
            <span className="data-analysis-result-hero__metric">
              <IconCheck style={{ width: 12, height: 12 }} />
              OSS归档
            </span>
            <span className="data-analysis-result-hero__metric">
              <IconCheck style={{ width: 12, height: 12 }} />
              云端记录
            </span>
          </div>
        </div>
        <GenerationResultTile
          title="巡店话术卡片"
          sub={`话术 ${selectedScript.id} · ${selectedScript.title}`}
          item={item}
          exportSize={`${PATROL_SCRIPT_EXPORT_SIZE.w}×${PATROL_SCRIPT_EXPORT_SIZE.h}`}
          idleMessage="选择话术、填写店铺名后点击生成，卡片会显示在这里"
          onRetry={onRetry}
          onDownload={onDownload}
        />
      </div>
    </>
  );
}
