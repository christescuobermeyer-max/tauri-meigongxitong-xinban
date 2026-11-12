import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { ProductAnimationWorkspace } from "../../hooks/useProductAnimation";
import { ANIMATION_STYLES, type AnimationFormat, type AnimationRatio } from "../../lib/product-animation/policy";
import { createAnimationRenderer } from "../../lib/product-animation/render";
import { animationFileUrl, saveAnimation, type AnimationResult } from "../../lib/product-animation/desktop";
import { modelJobActive, modelJobLabel, type ModelJob } from "../../lib/product-animation/cloud";
import { IconAlert, IconCheck, IconDownload, IconHistory, IconHourglass, IconImage, IconPause, IconPlay, IconRefresh, IconSparkles, IconUpload } from "../Icons";
import "../../styles/product-animation.css";

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; text: string }[]; onChange: (value: T) => void }) {
  return <div className="pa-field"><span className="pa-field__label">{label}</span>
    <div className="pa-segmented" role="radiogroup" aria-label={label}>{options.map((option) => <button key={String(option.value)} type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? "is-active" : ""} onClick={() => onChange(option.value)}>{option.text}</button>)}</div>
  </div>;
}

// The source <img> URL may already be revoked, so draw the decoded image instead of reusing its src.
function SourceThumb({ image }: { image: HTMLImageElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = ref.current;
    const context = target?.getContext("2d");
    if (!target || !context || !image.naturalWidth) return;
    target.width = 152;target.height = 114;
    const scale = Math.max(target.width / image.naturalWidth, target.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, (target.width - width) / 2, (target.height - height) / 2, width, height);
  }, [image]);
  return <canvas ref={ref} className="pa-drop__thumb" aria-hidden="true" />;
}

function Step({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return <div className="pa-step"><div className="pa-step__head"><span className="pa-step__no">{index}</span><h3>{title}</h3></div>{children}</div>;
}

const jobTone = (job: ModelJob) => job.status === "succeeded" ? "success" : job.status === "failed" ? "danger" : job.status === "reconciling" ? "warn" : "info";

export default function ProductAnimationWorkspacePage({ workspace }: { workspace: ProductAnimationWorkspace }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { source, size, style, duration, current, busy } = workspace;
  const isModel = style === "steam";
  const uploadLocked = busy || workspace.loadingSource;
  const modelBlocked = isModel && (!workspace.modelEnabled || workspace.cloudJobs.some(modelJobActive));

  useEffect(() => {
    if (!canvas.current || !source || !size || current) return;
    const target = canvas.current;
    const render = createAnimationRenderer(source.image, size.width, size.height, style);
    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      render(target, playing && !busy ? ((now - start) % duration) / duration : 0);
      if (style !== "steam" && playing && !busy) frame = requestAnimationFrame(draw);
    };
    draw(start);
    return () => { cancelAnimationFrame(frame);target.width = 1;target.height = 1; };
  }, [source, size?.width, size?.height, style, duration, playing, current, busy]);

  async function download(result: AnimationResult) {
    setSaving(true);
    try { await saveAnimation(workspace.userId, result); }
    catch (reason) { workspace.setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  }

  async function downloadModelJob(id: string) {
    const result = await workspace.openModelJob(id);
    if (result) await download(result);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!uploadLocked && file && /^image\/(png|jpeg|webp)$/.test(file.type)) void workspace.loadSource(file);
  }

  const reset = () => workspace.setCurrent(null);
  const stageLabel = current ? "生成结果" : source ? (isModel ? "原图 · 生成后显示模型动效" : "实时效果预览") : "等待上传";

  return <div className="pa">
    <header className="pa-hero">
      <div className="pa-hero__badge" aria-hidden="true"><IconSparkles width={26} height={26} /></div>
      <div className="pa-hero__text"><h2>动图制作</h2><p>上传菜品图，一键生成外卖平台可直接上传的菜品动图</p></div>
      <ul className="pa-hero__specs" aria-label="平台规格">
        {["GIF / WebP", "4:3 · 16:9", "2–5 秒", "≤ 5MB"].map((text) => <li key={text}><IconCheck width={13} height={13} aria-hidden="true" />{text}</li>)}
      </ul>
    </header>

    <div className="pa-layout">
      <section className="pa-panel">
        <Step index={1} title="选择菜品图">
          <label className={`pa-drop${source ? " has-source" : ""}${dragging ? " is-dragging" : ""}${uploadLocked ? " is-locked" : ""}`}
            onDragOver={(event) => { event.preventDefault();if (!uploadLocked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
            {source ? <>
              <SourceThumb image={source.image} />
              <span className="pa-drop__meta"><strong title={source.name}>{source.name}</strong>
                <small>{source.image.naturalWidth}×{source.image.naturalHeight}{size && <> → 输出 {size.width}×{size.height}</>}</small></span>
              <span className="pa-drop__change"><IconRefresh width={14} height={14} aria-hidden="true" />更换</span>
            </> : <>
              <span className="pa-drop__icon" aria-hidden="true">{workspace.loadingSource ? <IconHourglass width={22} height={22} /> : <IconUpload width={22} height={22} />}</span>
              <strong>{workspace.loadingSource ? "正在载入图片…" : "点击或拖入菜品图片"}</strong>
              <small>支持 PNG / JPG / WebP；也可在产品图结果或历史记录中点击“制作动图”</small>
            </>}
            <input aria-label="选择菜品图片" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadLocked} onChange={(event) => { const file = event.target.files?.[0];if (file) void workspace.loadSource(file);event.target.value = ""; }} />
          </label>
        </Step>

        <Step index={2} title="选择动图风格">
          <div className="pa-styles" role="radiogroup" aria-label="动图风格">{ANIMATION_STYLES.map((entry) => {
            const active = style === entry.id;
            return <button key={entry.id} type="button" role="radio" aria-checked={active} disabled={busy} className={`pa-style${active ? " is-active" : ""}`} onClick={() => { workspace.setStyle(entry.id);reset(); }}>
              <span className="pa-style__tile" style={{ color: entry.color }}>{entry.id === "steam" && <><span className="pa-style__steam" aria-hidden="true"><i /><i /><i /></span><em className="pa-style__tag">AI 生成</em></>}<b>{entry.title}</b></span>
              <span className="pa-style__body"><small>{entry.description}</small></span>
              {active && <span className="pa-style__check" aria-hidden="true"><IconCheck width={12} height={12} /></span>}
            </button>;
          })}</div>
        </Step>

        <Step index={3} title="输出设置">
          <fieldset disabled={busy} className="pa-fields">
            <Segmented<AnimationRatio> label="平台比例" value={workspace.ratio} options={[{ value: "4:3", text: "4:3" }, { value: "16:9", text: "16:9" }]} onChange={(value) => { workspace.setRatio(value);reset(); }} />
            <Segmented<AnimationFormat> label="格式" value={workspace.format} options={[{ value: "gif", text: "GIF" }, { value: "webp", text: "WebP" }]} onChange={(value) => { workspace.setFormat(value);reset(); }} />
            <Segmented<number> label="循环时长" value={duration} options={[2, 3, 4, 5].map((seconds) => ({ value: seconds * 1000, text: `${seconds}秒` }))} onChange={(value) => { workspace.setDuration(value);reset(); }} />
          </fieldset>
        </Step>

        {isModel && <div className="pa-callout" role="status">
          <IconSparkles width={16} height={16} aria-hidden="true" />
          <div><strong>AI 模型生成自然热气与菜品细微动态</strong>
            <p>约 3–4 分钟完成，提交后可离开页面，回来会继续查询。画面铺满画布（输出 768 宽），必要时裁掉底部少量画面；动效按原速完整循环，时长可能与所选略有差异。每次生成都会调用模型。</p></div>
        </div>}
        {isModel && workspace.modelStatus && <p className="pa-note">{workspace.modelStatus}</p>}
        {workspace.pendingId && <p className="pa-note pa-note--warn">上次提交尚未确认（任务标识 {workspace.pendingId}）。请先刷新状态；重试将沿用同一请求标识，不会重复扣费。</p>}
        {source && size?.adjusted && !isModel && <p className="pa-note">原图按所选比例完整适配，不拉伸、不裁切。</p>}

        <div className="pa-cta">
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!source || uploadLocked || modelBlocked} onClick={() => void workspace.generate()}>
            {busy ? <IconHourglass width={16} height={16} aria-hidden="true" /> : <IconSparkles width={16} height={16} aria-hidden="true" />}
            {busy ? "正在处理…" : isModel ? (workspace.pendingId ? "重试同一请求" : "生成模型动图") : "生成合规动图"}
          </button>
          {busy && !workspace.cloudSubmitting && <button type="button" className="btn btn--secondary" onClick={workspace.cancel}>取消</button>}
        </div>
        {busy && <div className="pa-progress" role="status">{workspace.cloudSubmitting ? <p><span className="pa-spinner" aria-hidden="true" />正在提交或读取模型动图…</p> : <>
          <div className="pa-progress__bar"><span style={{ width: `${workspace.progress}%` }} /></div>
          <progress className="pa-visually-hidden" max={100} value={workspace.progress} />
          <p>{workspace.progress < 80 ? `正在绘制动画 ${workspace.progress}%` : "正在压缩并检查比例、时长和体积…"}</p></>}</div>}
        {workspace.error && <p role="alert" className="pa-error"><IconAlert width={16} height={16} aria-hidden="true" /><span>{workspace.error}</span></p>}
      </section>

      <section className="pa-preview">
        <div className="pa-preview__bar">
          <span className={`pa-chip${current ? " pa-chip--success" : ""}`}>{current ? <IconCheck width={12} height={12} aria-hidden="true" /> : <IconImage width={12} height={12} aria-hidden="true" />}{stageLabel}</span>
          {(source || current) && <div className="pa-preview__tools">
            {(current || !isModel) && <button className="pa-icon-btn" type="button" aria-label={playing ? "暂停预览" : "播放预览"} title={playing ? "暂停预览" : "播放预览"} onClick={() => setPlaying((value) => !value)}>{playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}</button>}
            {current && <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void download(current)}><IconDownload width={15} height={15} aria-hidden="true" />下载 {current.media.format.toUpperCase()}</button>}
          </div>}
        </div>
        <div className="pa-stage">{current ? <img src={animationFileUrl(playing ? current.path : current.posterPath)} alt="生成的菜品动图" /> : source ? <canvas ref={canvas} aria-label="动图效果预览" /> : <div className="pa-empty">
          <span className="pa-empty__icon" aria-hidden="true"><IconImage width={30} height={30} /></span>
          <strong>还没有菜品图</strong><p>在左侧上传一张菜品图，这里会实时预览动图效果</p>
        </div>}</div>
        {current && <div className="pa-metrics">
          <span className="pa-metrics__ok"><IconCheck width={14} height={14} aria-hidden="true" />已通过平台规格校验</span>
          <dl>
            <div><dt>尺寸</dt><dd>{current.media.width}×{current.media.height}</dd></div>
            <div><dt>时长</dt><dd>{(current.media.durationMs / 1000).toFixed(2)} 秒</dd></div>
            <div><dt>帧数</dt><dd>{current.media.frames} 帧</dd></div>
            <div><dt>大小</dt><dd>{(current.media.bytes / 1_000_000).toFixed(2)} MB</dd></div>
          </dl>
        </div>}
      </section>
    </div>

    <section className="pa-section">
      <div className="pa-section__head">
        <div><h3><IconSparkles width={16} height={16} aria-hidden="true" />模型动图 · 云端记录</h3><p>热气腾腾风格的生成任务，换电脑登录也能查看</p></div>
        <button className="btn btn--secondary btn--sm" type="button" aria-label="刷新模型任务" onClick={() => void workspace.refreshCloudJobs()}><IconRefresh width={14} height={14} aria-hidden="true" />刷新</button>
      </div>
      {workspace.cloudJobs.length ? <div className="pa-grid">{workspace.cloudJobs.map((job) => <article key={job.id} className="pa-card">
        {job.result ? <button type="button" className="pa-card__media pa-card__open" disabled={busy} onClick={() => void workspace.openModelJob(job.id)} aria-label="在预览区查看"><img loading="lazy" decoding="async" src={job.result.url} alt="模型动图" /></button>
          : <div className="pa-card__media"><span className="pa-card__placeholder" aria-hidden="true">{job.status === "failed" ? <IconAlert width={22} height={22} /> : <span className="pa-spinner pa-spinner--lg" />}</span></div>}
        <div className="pa-card__body">
          <span className={`pa-badge pa-badge--${jobTone(job)}`}>{modelJobLabel(job)}</span>
          <small>{new Date(job.createdAt).toLocaleString()} · {job.spec.width}×{job.spec.height}</small>
          {job.result && <small>模型原件 {job.result.sourceMedia.width}×{job.result.sourceMedia.height}，循环 {job.result.sourceMedia.cycles} 次 → {(job.result.media.durationMs / 1000).toFixed(2)} 秒{job.result.sourceMedia.upscaled && "，已放大铺满画布"}</small>}
          {job.error && <p className="pa-card__error">{job.error}</p>}
          {job.status === "succeeded" && job.result && <button className="btn btn--primary btn--sm" type="button" disabled={busy || saving} onClick={() => void downloadModelJob(job.id)}><IconDownload width={14} height={14} aria-hidden="true" />下载 {job.result.media.format.toUpperCase()}</button>}
        </div>
      </article>)}</div> : <p className="pa-section__empty">暂无模型动图任务</p>}
    </section>

    <section className="pa-section">
      <div className="pa-section__head"><div><h3><IconHistory width={16} height={16} aria-hidden="true" />本机动图记录</h3><p>当前账号 · 保存在本机 · 最近 50 条，可再次下载</p></div></div>
      {workspace.results.length ? <div className="pa-grid">{workspace.results.map((result) => <article key={result.id} className={`pa-card${current?.id === result.id ? " is-current" : ""}`}>
        <button type="button" className="pa-card__media pa-card__open" disabled={busy} onClick={() => workspace.setCurrent(result)} aria-label="在预览区查看"><img loading="lazy" decoding="async" src={animationFileUrl(result.path)} alt="本机动图" /></button>
        <div className="pa-card__body">
          <strong>{ANIMATION_STYLES.find((entry) => entry.id === result.style)?.title || "动图"}</strong>
          <small>{result.media.width}×{result.media.height} · {result.media.format.toUpperCase()} · {(result.media.bytes / 1_000_000).toFixed(2)}MB</small>
          <button className="btn btn--primary btn--sm" type="button" disabled={saving} onClick={() => void download(result)}><IconDownload width={14} height={14} aria-hidden="true" />下载 {result.media.format.toUpperCase()}</button>
        </div>
      </article>)}</div> : <p className="pa-section__empty">生成的动图会出现在这里</p>}
    </section>
  </div>;
}
