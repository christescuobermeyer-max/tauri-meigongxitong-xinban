import { useEffect, useRef, useState } from "react";
import type { ProductAnimationWorkspace } from "../../hooks/useProductAnimation";
import { ANIMATION_STYLES, type AnimationFormat, type AnimationRatio } from "../../lib/product-animation/policy";
import { createAnimationRenderer } from "../../lib/product-animation/render";
import { animationFileUrl, saveAnimation, type AnimationResult } from "../../lib/product-animation/desktop";
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
      if (playing && !busy) frame = requestAnimationFrame(draw);
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
        {source && size && <p className="product-animation__hint">原图 {source.image.naturalWidth}×{source.image.naturalHeight} → 输出 {size.width}×{size.height}。{size.adjusted ? "按所选比例完整适配，不拉伸、不裁切，空白处补深色背景。" : "保持原图尺寸。"}</p>}
        <div className="product-animation__actions"><button type="button" className="btn btn--primary" disabled={!source || busy || workspace.loadingSource} onClick={() => void workspace.generate()}>{busy ? "正在制作…" : "生成合规动图"}</button>{busy && <button type="button" className="btn" onClick={workspace.cancel}>取消</button>}</div>
        {busy && <div role="status"><progress max={100} value={workspace.progress} /><p>{workspace.progress < 80 ? `正在绘制动画 ${workspace.progress}%` : "正在压缩并检查比例、时长和体积…"}</p></div>}
        {workspace.error && <p role="alert" className="product-animation__error">{workspace.error}</p>}
      </section>
      <section className="product-animation__preview">
        <div className="product-animation__stage">{current ? <img src={animationFileUrl(playing ? current.path : current.posterPath)} alt="生成的菜品动图" /> : source ? <canvas ref={canvas} aria-label="动图效果预览" /> : <div className="product-animation__empty">选择一张菜品图，预览热气与动态贴纸</div>}</div>
        {(source || current) && <div className="product-animation__actions"><button className="btn" type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "暂停预览" : "播放预览"}</button>{current && <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void download(current)}>下载 {current.media.format.toUpperCase()}</button>}</div>}
        {current && <p className="product-animation__hint">已通过校验：{current.media.width}×{current.media.height} · {(current.media.durationMs / 1000).toFixed(2)}秒 · {current.media.frames}帧 · {(current.media.bytes / 1_000_000).toFixed(2)}MB</p>}
      </section>
    </div>
    <section className="product-animation__history"><h3>动图记录 <small>当前账号 · 本机保存 · 最近50条</small></h3><p className="product-animation__hint">成功文件保存在本机，可再次下载；不会作为静态图上传云端历史。</p>
      <div className="product-animation__history-grid">{workspace.results.map((result) => <article key={result.id}><button type="button" disabled={busy} onClick={() => workspace.setCurrent(result)}><img loading="lazy" src={animationFileUrl(result.posterPath)} alt="动图封面" /><strong>{ANIMATION_STYLES.find((entry) => entry.id === result.style)?.title || "动图"}</strong></button><small>{result.media.width}×{result.media.height} · {(result.media.bytes / 1_000_000).toFixed(2)}MB</small><button className="btn" type="button" disabled={saving} onClick={() => void download(result)}>下载 {result.media.format.toUpperCase()}</button></article>)}</div>
    </section>
  </div>;
}
