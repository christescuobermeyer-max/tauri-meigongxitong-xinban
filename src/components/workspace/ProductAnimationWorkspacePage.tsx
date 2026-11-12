import { Fragment, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { MAX_ANIMATION_ITEMS, type AnimationItemStatus, type ProductAnimationWorkspace } from "../../hooks/useProductAnimation";
import { ANIMATION_STYLES, ANIMATION_STYLE_GROUPS, type AnimationFormat, type AnimationRatio, type AnimationStyle } from "../../lib/product-animation/policy";
import { createAnimationRenderer } from "../../lib/product-animation/render";
import { loadAnimationFonts } from "../../lib/product-animation/fonts";
import { animationFileUrl, saveAnimation, type AnimationResult } from "../../lib/product-animation/desktop";
import { IconAlert, IconCheck, IconClose, IconDownload, IconHistory, IconHourglass, IconImage, IconPause, IconPlay, IconSparkles, IconTrash, IconUpload } from "../Icons";
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

// Small thumbnail of a style on the uploaded dish: a still frame, animating only while hovered.
function StyleThumb({ image, style, animate, fontsReady }: { image: HTMLImageElement; style: AnimationStyle; animate: boolean; fontsReady: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    const render = createAnimationRenderer(image, 192, 144, style);
    const start = performance.now() - 1050;
    let frame = 0;
    const draw = (now: number) => { render(target, animate ? ((now - start) % 3000) / 3000 : 0.35);if (animate) frame = requestAnimationFrame(draw); };
    draw(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [image, style, animate, fontsReady]);
  return <canvas ref={ref} className="pa-style__preview" aria-hidden="true" />;
}

function Step({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return <div className="pa-step"><div className="pa-step__head"><span className="pa-step__no">{index}</span><h3>{title}</h3></div>{children}</div>;
}

const STATUS_TEXT: Record<AnimationItemStatus, string> = { idle: "待生成", running: "生成中", done: "已完成", failed: "失败" };
const styleTitle = (id: AnimationStyle) => ANIMATION_STYLES.find((entry) => entry.id === id)?.title ?? "动图";

export default function ProductAnimationWorkspacePage({ workspace }: { workspace: ProductAnimationWorkspace }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Always autoplay: the preview is the product itself, so only an explicit pause should stop it.
  const [playing, setPlaying] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [hovered, setHovered] = useState<AnimationStyle | null>(null);
  useEffect(() => { let alive = true;void loadAnimationFonts().then(() => { if (alive) setFontsReady(true); });return () => { alive = false; }; }, []);
  const { source, size, style, duration, current, busy } = workspace;
  const uploadLocked = busy || workspace.loadingSource;
  const items = workspace.items;
  const multi = items.length > 1;
  const pendingCount = items.filter((item) => item.status !== "done").length;
  const doneCount = items.length - pendingCount;
  const [savedAll, setSavedAll] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState("");
  useEffect(() => { if (!confirmClear) return;const timer = window.setTimeout(() => setConfirmClear(false), 4000);return () => window.clearTimeout(timer); }, [confirmClear]);
  async function clearAll() {
    if (!confirmClear) { setConfirmClear(true);setCleared("");return; }
    setConfirmClear(false);
    const cleanup = await workspace.clearAll();
    if (cleanup) setCleared(`已清理 ${cleanup.removed} 个动图，释放 ${(cleanup.bytes / 1024 / 1024).toFixed(1)} MB`);
  }

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
  }, [source, size?.width, size?.height, style, duration, playing, current, busy, fontsReady]);

  async function download(result: AnimationResult) {
    setSaving(true);
    try { await saveAnimation(workspace.userId, result); }
    catch (reason) { workspace.setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();setDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) => /^image\/(png|jpeg|webp)$/.test(file.type));
    if (!uploadLocked && files.length) void workspace.loadSource(files);
  }

  const reset = () => workspace.setCurrent(null);
  const position = multi ? `第 ${items.findIndex((item) => item.key === workspace.selectedKey) + 1} 张 · ` : "";
  const stageLabel = position + (current ? "生成结果" : source ? "实时效果预览" : "等待上传");

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
        <Step index={1} title={items.length ? `选择菜品图（${items.length}/${MAX_ANIMATION_ITEMS}）` : "选择菜品图"}>
          {items.length > 0 && <div className="pa-items">{items.map((item, index) => {
            const itemStyle = item.style ?? workspace.sharedStyle;
            return <div key={item.key} className={`pa-item is-${item.status}${item.key === workspace.selectedKey ? " is-selected" : ""}`}>
              <button type="button" className="pa-item__open" aria-label={`查看第 ${index + 1} 张`} aria-pressed={item.key === workspace.selectedKey} onClick={() => workspace.selectItem(item.key)}>
                <SourceThumb image={item.image} />
                <span className="pa-item__no">{index + 1}</span>
                <span className="pa-item__state" title={item.error || STATUS_TEXT[item.status]}>{item.status === "running" ? <span className="pa-spinner" aria-hidden="true" /> : item.status === "done" ? <IconCheck width={12} height={12} aria-hidden="true" /> : item.status === "failed" ? <IconAlert width={12} height={12} aria-hidden="true" /> : null}{STATUS_TEXT[item.status]}</span>
              </button>
              <small className="pa-item__style">{styleTitle(itemStyle)}{item.style && items.length > 1 ? " · 单独" : ""}</small>
              {!busy && <button type="button" className="pa-item__remove" aria-label={`移除第 ${index + 1} 张`} onClick={() => workspace.removeItem(item.key)}><IconClose width={10} height={10} /></button>}
            </div>;
          })}</div>}
          {items.length < MAX_ANIMATION_ITEMS && <label className={`pa-drop${items.length ? " pa-drop--compact" : ""}${dragging ? " is-dragging" : ""}${uploadLocked ? " is-locked" : ""}`}
            onDragOver={(event) => { event.preventDefault();if (!uploadLocked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
            <span className="pa-drop__icon" aria-hidden="true">{workspace.loadingSource ? <IconHourglass width={items.length ? 16 : 22} height={items.length ? 16 : 22} /> : <IconUpload width={items.length ? 16 : 22} height={items.length ? 16 : 22} />}</span>
            <strong>{workspace.loadingSource ? "正在载入图片…" : items.length ? `继续添加（还可加 ${MAX_ANIMATION_ITEMS - items.length} 张）` : "点击或拖入菜品图片"}</strong>
            {!items.length && <small>一次最多 {MAX_ANIMATION_ITEMS} 张，支持 PNG / JPG / WebP；也可在产品图结果或历史记录中点击“制作动图”</small>}
            <input aria-label="选择菜品图片" type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={uploadLocked} onChange={(event) => { const files = Array.from(event.target.files ?? []);if (files.length) void workspace.loadSource(files);event.target.value = ""; }} />
          </label>}
          {source && size && <p className="pa-note pa-note--meta">当前：{source.name} · {source.image.naturalWidth}×{source.image.naturalHeight} → 输出 {size.width}×{size.height}</p>}
        </Step>

        <Step index={2} title="选择动图风格">
          <p className="pa-note pa-note--tight">{source ? "点选风格，右侧立即播放效果；鼠标悬停可预览小图动画。" : "上传菜品图后，风格缩略图会换成你的图片。"}</p>
          {multi && <div className="pa-scope"><Segmented<"all" | "one"> label="应用到" value={workspace.styleScope} options={[{ value: "all", text: "全部图片" }, { value: "one", text: "仅当前图片" }]} onChange={workspace.setStyleScope} /></div>}
          <div className="pa-styles" role="radiogroup" aria-label="动图风格">{ANIMATION_STYLES.map((entry, index) => {
            const active = style === entry.id;
            const groupStart = index === 0 || ANIMATION_STYLES[index - 1].group !== entry.group;
            return <Fragment key={entry.id}>
              {groupStart && <div className="pa-styles__group">{ANIMATION_STYLE_GROUPS[entry.group]}</div>}
              <button type="button" role="radio" aria-checked={active} disabled={busy} title={entry.description} className={`pa-style${active ? " is-active" : ""}`}
                onMouseEnter={() => setHovered(entry.id)} onMouseLeave={() => setHovered((value) => value === entry.id ? null : value)} onClick={() => { workspace.setStyle(entry.id);reset(); }}>
                <span className="pa-style__tile" style={{ color: entry.color }}>
                  {source ? <StyleThumb image={source.image} style={entry.id} animate={hovered === entry.id && playing && !busy} fontsReady={fontsReady} /> : <b>{entry.word}</b>}
                </span>
                <span className="pa-style__name">{entry.title}</span>
                {active && <span className="pa-style__check" aria-hidden="true"><IconCheck width={10} height={10} /></span>}
              </button>
            </Fragment>;
          })}</div>
        </Step>

        <Step index={3} title="输出设置">
          <fieldset disabled={busy} className="pa-fields">
            <Segmented<AnimationRatio> label="平台比例" value={workspace.ratio} options={[{ value: "4:3", text: "4:3" }, { value: "16:9", text: "16:9" }]} onChange={(value) => { workspace.setRatio(value);reset(); }} />
            <Segmented<AnimationFormat> label="格式" value={workspace.format} options={[{ value: "gif", text: "GIF" }, { value: "webp", text: "WebP" }]} onChange={(value) => { workspace.setFormat(value);reset(); }} />
            <Segmented<number> label="循环时长" value={duration} options={[2, 3, 4, 5].map((seconds) => ({ value: seconds * 1000, text: `${seconds}秒` }))} onChange={(value) => { workspace.setDuration(value);reset(); }} />
          </fieldset>
        </Step>

        {source && size?.adjusted && <p className="pa-note">原图按所选比例完整适配，不拉伸、不裁切。</p>}

        <div className="pa-cta">
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!items.length || uploadLocked} onClick={() => { setSavedAll("");void workspace.generate(); }}>
            {busy ? <IconHourglass width={16} height={16} aria-hidden="true" /> : <IconSparkles width={16} height={16} aria-hidden="true" />}
            {busy ? "正在处理…" : multi ? (pendingCount ? `开始批量生成（${pendingCount} 张）` : "重新生成全部") : "生成合规动图"}
          </button>
          {busy && <button type="button" className="btn btn--secondary" onClick={workspace.cancel}>{multi ? "停止" : "取消"}</button>}
        </div>
        {busy && <div className="pa-progress" role="status">
          {workspace.progress > 0 && <><div className="pa-progress__bar"><span style={{ width: `${workspace.progress}%` }} /></div><progress className="pa-visually-hidden" max={100} value={workspace.progress} /></>}
          <p>{workspace.progress === 0 && <span className="pa-spinner" aria-hidden="true" />}{workspace.queueStatus || "正在处理…"}</p>
        </div>}
        {workspace.error && <p role="alert" className="pa-error"><IconAlert width={16} height={16} aria-hidden="true" /><span>{workspace.error}</span></p>}
      </section>

      <section className="pa-preview">
        <div className="pa-preview__bar">
          <div className="pa-preview__title"><strong>{current ? styleTitle(current.style) : styleTitle(style)}</strong><span>{ANIMATION_STYLES.find((entry) => entry.id === (current?.style ?? style))?.description}</span></div>
          <span className={`pa-chip${current ? " pa-chip--success" : ""}`}>{current ? <IconCheck width={12} height={12} aria-hidden="true" /> : <IconImage width={12} height={12} aria-hidden="true" />}{stageLabel}</span>
          {(source || current) && <div className="pa-preview__tools">
            {<button className="pa-icon-btn" type="button" aria-label={playing ? "暂停预览" : "播放预览"} title={playing ? "暂停预览" : "播放预览"} onClick={() => setPlaying((value) => !value)}>{playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}</button>}
            {current && <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void download(current)}><IconDownload width={15} height={15} aria-hidden="true" />下载 {current.media.format.toUpperCase()}</button>}
            {multi && doneCount > 0 && <button type="button" className="btn btn--secondary" disabled={saving || busy} onClick={async () => { setSaving(true);const count = await workspace.downloadAll();setSaving(false);setSavedAll(count ? `已保存 ${count} 张到所选文件夹` : ""); }}><IconDownload width={15} height={15} aria-hidden="true" />全部下载（{doneCount}）</button>}
          </div>}
        </div>
        {savedAll && <p className="pa-saved" role="status"><IconCheck width={14} height={14} aria-hidden="true" />{savedAll}</p>}
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
      <div className="pa-section__head"><div><h3><IconHistory width={16} height={16} aria-hidden="true" />本机动图记录</h3><p>当前账号 · 保存在本机 · 最近 50 条，可再次下载；清空只删除软件内保存的动图，已下载到其他位置的文件不受影响</p></div>
        {workspace.results.length > 0 && <div className="pa-clear">
          {confirmClear && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmClear(false)}>取消</button>}
          <button type="button" className={`btn btn--sm ${confirmClear ? "pa-clear__confirm" : "btn--secondary"}`} disabled={busy} onClick={() => void clearAll()}><IconTrash width={14} height={14} aria-hidden="true" />{confirmClear ? "确认清空全部动图？" : "一键清空"}</button>
        </div>}
      </div>
      {cleared && <p className="pa-saved pa-saved--block" role="status"><IconCheck width={14} height={14} aria-hidden="true" />{cleared}</p>}
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
