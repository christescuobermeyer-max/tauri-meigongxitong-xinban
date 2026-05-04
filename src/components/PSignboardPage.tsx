import type { GenerationItem, GenerationLine, UploadedImage } from "../types";
import { canGeneratePSignboard } from "../lib/p-signboard-form";
import ImageUpload from "./ImageUpload";
import GenerationStatusBadge from "./GenerationStatusBadge";
import GenerationLineCard from "./GenerationLineCard";
import { IconAlert, IconCheck, IconImage, IconRefresh, IconSparkles, IconStore } from "./Icons";

interface Props {
  shopName: string;
  images: UploadedImage[];
  setImages: (images: UploadedImage[]) => void;
  originalText: string;
  setOriginalText: (value: string) => void;
  newText: string;
  setNewText: (value: string) => void;
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  item: GenerationItem;
  busy: boolean;
  onGenerate: () => void;
  onReset: () => void;
}

export default function PSignboardPage({
  images,
  setImages,
  originalText,
  setOriginalText,
  newText,
  setNewText,
  generationLine,
  setGenerationLine,
  item,
  busy,
  onGenerate,
  onReset,
}: Props) {
  const canGenerate = canGeneratePSignboard({
    imageCount: images.length,
    originalText,
    newText,
    busy,
  });

  return (
    <div className="picture-wall-split">
      <div className="panel-stack">
        <GenerationLineCard value={generationLine} onChange={setGenerationLine} />
        <section className="card">
          <div className="card__header">
            <div className="card__heading">
              <div className="card__title">P门头</div>
              <span className="card__hint">上传门头图片，替换招牌文字</span>
            </div>
          </div>
          <div className="card__body picture-wall-form">
            <div className="field">
              <label className="field__label">上传门头图片</label>
              <ImageUpload
                images={images}
                onChange={setImages}
                maxCount={1}
                dropzoneTitle="点击、拖拽或 Ctrl+V 粘贴 1 张门头图片"
                compressedLabel="门头参考图"
              />
            </div>
            <div className="field">
              <label className="field__label">原有文字内容</label>
              <input
                className="input"
                placeholder="例如：老王餐厅"
                value={originalText}
                onChange={(event) => setOriginalText(event.target.value)}
                maxLength={40}
              />
            </div>
            <div className="field">
              <label className="field__label">新文字内容</label>
              <input
                className="input"
                placeholder="例如：呈尚小厨"
                value={newText}
                onChange={(event) => setNewText(event.target.value)}
                maxLength={40}
              />
            </div>
            <div className="picture-wall-actions picture-wall-actions--two">
              <button className="btn btn--primary btn--lg" disabled={!canGenerate} onClick={onGenerate}>
                <IconSparkles style={{ width: 14, height: 14 }} />
                {busy ? "替换中…" : "开始替换文字"}
              </button>
              <button className="btn btn--secondary btn--lg" disabled={busy} onClick={onReset}>
                <IconRefresh style={{ width: 14, height: 14 }} />
                重置
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card__header">
          <div className="card__title">生成结果</div>
          <GenerationStatusBadge status={item.status} elapsedMs={item.elapsedMs} />
        </div>
        <div className="card__body">
          <div className="p-signboard-result" data-status={item.status}>
            {item.rawDataUrl ? (
              <img src={item.rawDataUrl} alt="P门头生成结果" />
            ) : item.status === "failed" ? (
              <div className="picture-wall-state picture-wall-state--error">
                <IconAlert style={{ width: 20, height: 20 }} />
                <strong>生成失败</strong>
                <span>{item.errorMessage || "请重置后重新生成"}</span>
              </div>
            ) : item.status === "running" ? (
              <div className="picture-wall-state">
                <div className="spinner spinner--lg" />
                <strong>正在替换门头文字…</strong>
                <span>系统会保持原图风格和透视效果</span>
              </div>
            ) : (
              <div className="picture-wall-state">
                {item.status === "succeeded" ? <IconCheck /> : <IconStore />}
                <strong>{item.status === "idle" ? "等待生成" : "已完成"}</strong>
                <span>{images[0]?.name || "上传门头图后开始替换"}</span>
              </div>
            )}
          </div>
          {item.remoteUrl ? (
            <div className="p-signboard-oss-note">
              <IconImage style={{ width: 14, height: 14 }} />
              已上传 OSS，并同步到历史记录和后台管理生成明细
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
