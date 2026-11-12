import { useEffect, useRef, useState } from "react";
import type { ProductAnimationWorkspace } from "../../hooks/useProductAnimation";
import { ANIMATION_STYLES, type AnimationFormat, type AnimationRatio } from "../../lib/product-animation/policy";
import { createAnimationRenderer } from "../../lib/product-animation/render";
import { animationFileUrl, saveAnimation, type AnimationResult } from "../../lib/product-animation/desktop";
import { modelJobActive, modelJobLabel } from "../../lib/product-animation/cloud";
import "../../styles/product-animation.css";

export default function ProductAnimationWorkspacePage({ workspace }: { workspace: ProductAnimationWorkspace }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [saving, setSaving] = useState(false);
  const { source, size, style, duration, current, busy } = workspace;

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

  return <div className="product-animation">
    <header className="product-animation__header"><div><h2>菜品动图</h2><p>原图保留 · 六种风格 · 平台规格自动检查</p></div><span>GIF / WebP · 2–5秒 · ≤5M</span></header>
    <div className="product-animation__layout">
      <section className="product-animation__settings">
        <label className="product-animation__upload">{workspace.loadingSource ? "正在载入图片…" : source?.name || "选择菜品图片"}
          <input aria-label="选择菜品图片" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || workspace.loadingSource} onChange={(event) => { const file = event.target.files?.[0];if (file) void workspace.loadSource(file);event.target.value = ""; }} />
        </label>
        <p className="product-animation__hint">也可从产品图结果或历史记录点击“制作动图”。</p>
        <fieldset disabled={busy} className="product-animation__fieldset"><legend>选择动图风格</legend>
          <div className="product-animation__styles">{ANIMATION_STYLES.map((entry) => <button key={entry.id} type="button" aria-pressed={style === entry.id} className={style === entry.id ? "active" : ""} onClick={() => { workspace.setStyle(entry.id);workspace.setCurrent(null); }}>
            <strong style={{ color: entry.id === "steam" ? undefined : entry.color }}>{entry.title}</strong><small>{entry.description}</small>
          </button>)}</div>
          <div className="product-animation__fields">
            <label>平台比例<select value={workspace.ratio} onChange={(event) => { workspace.setRatio(event.target.value as AnimationRatio);workspace.setCurrent(null); }}><option value="4:3">4:3</option><option value="16:9">16:9</option></select></label>
            <label>格式<select value={workspace.format} onChange={(event) => { workspace.setFormat(event.target.value as AnimationFormat);workspace.setCurrent(null); }}><option value="gif">GIF</option><option value="webp">WebP</option></select></label>
            <label>循环时长<select value={duration} onChange={(event) => { workspace.setDuration(Number(event.target.value));workspace.setCurrent(null); }}>{[2, 3, 4, 5].map((seconds) => <option key={seconds} value={seconds * 1000}>{seconds}秒</option>)}</select></label>
          </div>
        </fieldset>
        {style === "steam" && <p className="product-animation__hint" role="status">由模型生成自然热气与菜品细微动态，不加贴纸。生成前展示原图；提交后可离开页面，返回时继续查询。每次新生成会调用模型，返回效果需预览确认。</p>}
        {style === "steam" && <p className="product-animation__hint">模型结果会等比适配所选画布，并完整重复循环至2–5秒，保持原播放速度；实际时长可能与所选目标略有不同。放大不会增加原始清晰度。</p>}
        {style === "steam" && workspace.modelStatus && <p className="product-animation__hint">{workspace.modelStatus}</p>}
        {workspace.pendingId && <p className="product-animation__hint">上次提交尚未确认，任务标识：{workspace.pendingId}。请先刷新状态；重试将沿用同一请求标识。</p>}
        {source && size && <p className="product-animation__hint">原图 {source.image.naturalWidth}×{source.image.naturalHeight} → 输出 {size.width}×{size.height}。{size.adjusted ? "按所选比例完整适配，不拉伸、不裁切，空白处补深色背景。" : "保持原图尺寸。"}</p>}
        <div className="product-animation__actions"><button type="button" className="btn btn--primary" disabled={!source || busy || workspace.loadingSource || (style === "steam" && (!workspace.modelEnabled || workspace.cloudJobs.some(modelJobActive)))} onClick={() => void workspace.generate()}>{busy ? "正在处理…" : style === "steam" ? (workspace.pendingId ? "重试同一请求" : "生成模型动图") : "生成合规动图"}</button>{busy && !workspace.cloudSubmitting && <button type="button" className="btn" onClick={workspace.cancel}>取消</button>}</div>
        {busy && <div role="status">{workspace.cloudSubmitting ? <p>正在提交或读取模型动图…</p> : <><progress max={100} value={workspace.progress} /><p>{workspace.progress < 80 ? `正在绘制动画 ${workspace.progress}%` : "正在压缩并检查比例、时长和体积…"}</p></>}</div>}
        {workspace.error && <p role="alert" className="product-animation__error">{workspace.error}</p>}
      </section>
      <section className="product-animation__preview">
        <div className="product-animation__stage">{current ? <img src={animationFileUrl(playing ? current.path : current.posterPath)} alt="生成的菜品动图" /> : source ? <canvas ref={canvas} aria-label="动图效果预览" /> : <div className="product-animation__empty">选择一张菜品图，预览热气与动态贴纸</div>}</div>
        {(source || current) && <div className="product-animation__actions">{(current || style !== "steam") && <button className="btn" type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "暂停预览" : "播放预览"}</button>}{current && <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void download(current)}>下载 {current.media.format.toUpperCase()}</button>}</div>}
        {current && <p className="product-animation__hint">已通过校验：{current.media.width}×{current.media.height} · {(current.media.durationMs / 1000).toFixed(2)}秒 · {current.media.frames}帧 · {(current.media.bytes / 1_000_000).toFixed(2)}MB</p>}
      </section>
    </div>
    <section className="product-animation__history"><h3>模型动图 · 云端任务与记录</h3><button className="btn" type="button" onClick={() => void workspace.refreshCloudJobs()}>刷新模型任务</button>
      <div className="product-animation__history-grid">{workspace.cloudJobs.map((job) => <article key={job.id}>
        {job.result && <img loading="lazy" src={job.result.posterUrl} alt="模型动图封面" />}
        <strong>{modelJobLabel(job)}</strong><small>{new Date(job.createdAt).toLocaleString()} · {job.spec.width}×{job.spec.height}</small>
        {job.result && <small>模型原件 {job.result.sourceMedia.width}×{job.result.sourceMedia.height} · {(job.result.sourceMedia.durationMs / 1000).toFixed(2)}秒；完整循环 {job.result.sourceMedia.cycles} 次 → {(job.result.media.durationMs / 1000).toFixed(2)}秒。{job.result.sourceMedia.upscaled && "已等比放大，清晰度受模型原件限制。"}</small>}
        {job.error && <p>{job.error}</p>}
        {job.status === "succeeded" && <button className="btn" type="button" disabled={busy} onClick={() => void workspace.openModelJob(job.id)}>查看并保存到本机</button>}
      </article>)}</div>
    </section>
    <section className="product-animation__history"><h3>动图记录 <small>当前账号 · 本机保存 · 最近50条</small></h3><p className="product-animation__hint">成功文件保存在本机，可再次下载；不会作为静态图上传云端历史。</p>
      <div className="product-animation__history-grid">{workspace.results.map((result) => <article key={result.id}><button type="button" disabled={busy} onClick={() => workspace.setCurrent(result)}><img loading="lazy" src={animationFileUrl(result.posterPath)} alt="动图封面" /><strong>{ANIMATION_STYLES.find((entry) => entry.id === result.style)?.title || "动图"}</strong></button><small>{result.media.width}×{result.media.height} · {(result.media.bytes / 1_000_000).toFixed(2)}MB</small><button className="btn" type="button" disabled={saving} onClick={() => void download(result)}>下载 {result.media.format.toUpperCase()}</button></article>)}</div>
    </section>
  </div>;
}
