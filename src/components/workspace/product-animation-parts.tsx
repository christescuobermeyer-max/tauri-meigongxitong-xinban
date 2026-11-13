import type { ReactNode } from "react";
import type { AnimationUploadState } from "../../hooks/useProductAnimation";
import type { AnimationResult } from "../../lib/product-animation/desktop";
import { IconAlert, IconCheck, IconUpload } from "../Icons";

export const ANIMATION_COPY_TEXT =
  "老板好，店铺动图已经做好了～顾客刷外卖时，会动的菜品比静态图更容易让人停下来多看一眼，看得越久越有食欲，进店和下单的机会就更大。建议换到店铺招牌菜和主图位置，效果最明显！";

export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; text: string }[]; onChange: (value: T) => void }) {
  return <div className="pa-field"><span className="pa-field__label">{label}</span>
    <div className="pa-segmented" role="radiogroup" aria-label={label}>{options.map((option) => <button key={String(option.value)} type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? "is-active" : ""} onClick={() => onChange(option.value)}>{option.text}</button>)}</div>
  </div>;
}

export function Step({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return <div className="pa-step"><div className="pa-step__head"><span className="pa-step__no">{index}</span><h3>{title}</h3></div>{children}</div>;
}

export function ResultMetrics({ result }: { result: AnimationResult }) {
  return <div className="pa-metrics">
    <span className="pa-metrics__ok"><IconCheck width={14} height={14} aria-hidden="true" />已通过平台规格校验</span>
    <dl>
      <div><dt>尺寸</dt><dd>{result.media.width}×{result.media.height}</dd></div>
      <div><dt>时长</dt><dd>{(result.media.durationMs / 1000).toFixed(2)} 秒</dd></div>
      <div><dt>帧数</dt><dd>{result.media.frames} 帧</dd></div>
      <div><dt>大小</dt><dd>{(result.media.bytes / 1_000_000).toFixed(2)} MB</dd></div>
    </dl>
  </div>;
}

/** Cloud upload status of one animation; failed or never-uploaded records offer a manual upload. */
export function UploadStatus({ result, state, onUpload }: { result: AnimationResult; state?: AnimationUploadState; onUpload: (result: AnimationResult) => void }) {
  if (result.uploadedAt) return <span className="pa-upload is-done"><IconCheck width={12} height={12} aria-hidden="true" />已上传云端</span>;
  if (state === "uploading") return <span className="pa-upload" role="status"><span className="pa-spinner" aria-hidden="true" />上传云端中…</span>;
  return <button type="button" className={`pa-upload pa-upload--action${state === "failed" ? " is-failed" : ""}`} onClick={() => onUpload(result)}>
    {state === "failed" ? <IconAlert width={12} height={12} aria-hidden="true" /> : <IconUpload width={12} height={12} aria-hidden="true" />}
    {state === "failed" ? "上传失败，点击重试" : "上传到云端"}
  </button>;
}
