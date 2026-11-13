import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { AnimationVideo, VideoAnimationWorkspace, VideoSourceKind } from "../../hooks/useVideoAnimation";
import { animationFileUrl, type AnimationResult } from "../../lib/product-animation/desktop";
import type { AnimationFormat, AnimationRatio } from "../../lib/product-animation/policy";
import { availableClipLengths, formatClipTime, moveCrop, resizeCrop, type VideoCrop } from "../../lib/product-animation/video";
import { IconAlert, IconCheck, IconDownload, IconHourglass, IconPause, IconPlay, IconScissors, IconVideo } from "../Icons";
import MerchantCopyCard from "../MerchantCopyCard";
import { ANIMATION_COPY_TEXT, ResultMetrics, Segmented, Step } from "./product-animation-parts";

/** Fixed-length window on the video timeline: drag it, click the track, or use the arrow keys. */
function ClipTimeline({ durationMs, clipMs, startMs, currentMs, disabled, onChange }: { durationMs: number; clipMs: number; startMs: number; currentMs: number; disabled: boolean; onChange: (startMs: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const toMs = (pixels: number) => pixels / (track.current?.getBoundingClientRect().width || 1) * durationMs;
  function onTrackDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onChange(toMs(event.clientX - rect.left) - clipMs / 2);
  }
  function onWindowDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, start: startMs };
  }
  function onWindowMove(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) onChange(drag.current.start + toMs(event.clientX - drag.current.x));
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 1000 : 100;
    const next = { ArrowLeft: startMs - step, ArrowRight: startMs + step, Home: 0, End: durationMs }[event.key];
    if (next === undefined || disabled) return;
    event.preventDefault();onChange(next);
  }
  const percent = (ms: number) => `${ms / durationMs * 100}%`;
  return <div className="pa-clip">
    <div ref={track} className={`pa-clip__track${disabled ? " is-disabled" : ""}`} onPointerDown={onTrackDown}>
      <div className="pa-clip__window" role="slider" tabIndex={disabled ? -1 : 0} aria-label="片段位置" aria-valuemin={0} aria-valuemax={Math.max(0, durationMs - clipMs)} aria-valuenow={startMs} aria-valuetext={`从 ${formatClipTime(startMs)} 开始`}
        style={{ left: percent(startMs), width: percent(clipMs) }} onPointerDown={onWindowDown} onPointerMove={onWindowMove} onPointerUp={() => { drag.current = null; }} onKeyDown={onKey}>
        <span aria-hidden="true" /><span aria-hidden="true" />
      </div>
      <div className="pa-clip__playhead" style={{ left: percent(currentMs) }} aria-hidden="true" />
    </div>
    <div className="pa-clip__meta"><span>开始 {formatClipTime(startMs)}</span><strong>{clipMs / 1000} 秒</strong><span>结束 {formatClipTime(startMs + clipMs)}</span></div>
  </div>;
}

interface StageProps {
  video: AnimationVideo; crop: VideoCrop | null; ratio: AnimationRatio; startMs: number; clipMs: number; playing: boolean; disabled: boolean;
  onCrop: (crop: VideoCrop) => void; onMetadata: (width: number, height: number, seconds: number) => void; onError: () => void; onTime: (ms: number) => void;
}

/** The video, looping inside the chosen clip, with a draggable platform-ratio crop frame on top. */
function VideoCropStage({ video, crop, ratio, startMs, clipMs, playing, disabled, onCrop, onMetadata, onError, onTime }: StageProps) {
  const element = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ kind: "move" | "resize"; x: number; y: number; crop: VideoCrop } | null>(null);

  useEffect(() => {
    const target = element.current;
    if (!target || !video.width) return;
    target.currentTime = startMs / 1000;
  }, [startMs, video.width, video.url]);

  useEffect(() => {
    const target = element.current;
    if (!target || !video.width) return;
    if (!playing) { target.pause();return; }
    void target.play().catch(() => undefined);
    let raf = 0, reported = 0;
    const tick = (now: number) => {
      const ms = target.currentTime * 1000;
      if (ms < startMs - 80 || ms >= startMs + clipMs) target.currentTime = startMs / 1000;
      if (now - reported > 100) { reported = now;onTime(target.currentTime * 1000); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, startMs, clipMs, video.width, video.url]);

  const scale = () => video.width / (frame.current?.getBoundingClientRect().width || 1);
  function begin(kind: "move" | "resize", event: PointerEvent<HTMLElement>) {
    if (disabled || !crop) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind, x: event.clientX, y: event.clientY, crop };
  }
  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active) return;
    const dx = (event.clientX - active.x) * scale(), dy = (event.clientY - active.y) * scale();
    onCrop(active.kind === "move" ? moveCrop(active.crop, dx, dy, video.width, video.height)
      : resizeCrop(active.crop, active.crop.width + Math.max(dx, dy * (ratio === "4:3" ? 4 / 3 : 16 / 9)), video.width, video.height, ratio));
  }
  const end = () => { gesture.current = null; };
  const aspect = video.width ? `${video.width} / ${video.height}` : "16 / 9";
  const pct = (value: number, total: number) => `${value / total * 100}%`;

  return <div ref={frame} className="pa-vstage" style={{ aspectRatio: aspect, width: `min(100%, calc((100vh - 300px) * ${video.width ? video.width / video.height : 16 / 9}))` }}>
    <video ref={element} src={video.url} muted playsInline preload="auto" aria-label="视频预览"
      onLoadedMetadata={(event) => onMetadata(event.currentTarget.videoWidth, event.currentTarget.videoHeight, event.currentTarget.duration)} onError={onError} />
    {crop && video.width > 0 && <div className="pa-crop" role="group" aria-label="取景框" style={{ left: pct(crop.x, video.width), top: pct(crop.y, video.height), width: pct(crop.width, video.width), height: pct(crop.height, video.height) }}
      onPointerDown={(event) => begin("move", event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <span className="pa-crop__tag">{ratio} 取景</span>
      <span className="pa-crop__handle" aria-label="调整取景框大小" onPointerDown={(event) => begin("resize", event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    </div>}
  </div>;
}

interface Props { workspace: VideoAnimationWorkspace; current: AnimationResult | null; saving: boolean; onDownload: (result: AnimationResult) => void; onReset: () => void }

export default function VideoAnimationPanel({ workspace, current, saving, onDownload, onReset }: Props) {
  const { video, busy, ready, clipMs } = workspace;
  const [playing, setPlaying] = useState(true);
  const [currentMs, setCurrentMs] = useState(0);
  const locked = busy || workspace.loading;
  const lengths = video?.durationMs ? availableClipLengths(video.durationMs) : [2000, 3000, 4000, 5000];
  // Any edit returns the preview from the finished animation to the editor.
  const edit = <T,>(apply: (value: T) => void) => (value: T) => { apply(value);onReset(); };
  const chip = current ? "生成结果" : video ? (video.width ? "拖动取景框选择画面" : "正在读取视频") : "等待选择视频";

  return <div className="pa-layout">
    <section className="pa-panel">
      <Step index={1} title="选择视频">
        {video ? <div className="pa-video-file">
          <span className="pa-drop__icon" aria-hidden="true"><IconVideo width={18} height={18} /></span>
          <div className="pa-drop__meta"><strong title={video.name}>{video.name}</strong>
            <small>{video.width ? `${video.width}×${video.height} · ${formatClipTime(video.durationMs)}${video.transcoded ? " · 已转码预览" : ""}` : workspace.status || "正在读取…"}</small></div>
          <button type="button" className="btn btn--secondary btn--sm" disabled={locked} onClick={() => { onReset();workspace.clearVideo(); }}>更换视频</button>
        </div> : <>
          <div className="pa-scope"><Segmented<VideoSourceKind> label="视频来源" value={workspace.sourceKind} options={[{ value: "link", text: "粘贴链接" }, { value: "file", text: "上传视频" }]} onChange={(value) => { if (!workspace.loading) { workspace.setSourceKind(value);workspace.setError(""); } }} /></div>
          {workspace.sourceKind === "link" ? <form className="pa-link" onSubmit={(event) => { event.preventDefault();void workspace.parseLink(); }}>
            <textarea className="textarea pa-link__input" aria-label="视频分享链接" value={workspace.link} disabled={workspace.loading} rows={3}
              placeholder="粘贴小红书或抖音分享链接，整段分享文字也可以" onChange={(event) => workspace.setLink(event.target.value)} />
            <button type="submit" className="btn btn--primary btn--block" disabled={workspace.loading || !workspace.link.trim()}>
              {workspace.loading ? <IconHourglass width={15} height={15} aria-hidden="true" /> : <IconVideo width={15} height={15} aria-hidden="true" />}
              {workspace.loading ? workspace.status || "正在解析…" : "解析链接"}
            </button>
          </form> : <button type="button" className={`pa-drop${locked ? " is-locked" : ""}`} disabled={locked} onClick={() => void workspace.pick()}>
            <span className="pa-drop__icon" aria-hidden="true">{workspace.loading ? <IconHourglass width={22} height={22} /> : <IconVideo width={22} height={22} />}</span>
            <strong>{workspace.loading ? workspace.status || "正在载入视频…" : "点击选择菜品视频"}</strong>
            <small>支持 MP4 / MOV / MKV / WebM / AVI，手机拍的视频也可以</small>
          </button>}
          {/* Source errors sit next to the input that caused them. */}
          {workspace.error && <p role="alert" className="pa-error pa-error--source"><IconAlert width={16} height={16} aria-hidden="true" /><span>{workspace.error}</span></p>}
        </>}
      </Step>

      <Step index={2} title="选择片段">
        <fieldset disabled={locked || !ready} className="pa-fields">
          <Segmented<number> label="片段时长" value={clipMs} options={lengths.map((ms) => ({ value: ms, text: `${ms / 1000}秒` }))} onChange={edit(workspace.setClip)} />
        </fieldset>
        {ready && video ? <ClipTimeline durationMs={video.durationMs} clipMs={clipMs} startMs={workspace.startMs} currentMs={currentMs} disabled={locked} onChange={edit(workspace.setStart)} />
          : <p className="pa-note pa-note--tight">选好视频后，在时间轴上拖动选择要做成动图的那一段。</p>}
      </Step>

      <Step index={3} title="输出设置">
        <fieldset disabled={locked} className="pa-fields">
          <Segmented<AnimationRatio> label="平台比例" value={workspace.ratio} options={[{ value: "4:3", text: "4:3" }, { value: "16:9", text: "16:9" }]} onChange={edit(workspace.setRatio)} />
          <Segmented<AnimationFormat> label="格式" value={workspace.format} options={[{ value: "gif", text: "GIF" }, { value: "webp", text: "WebP" }]} onChange={edit(workspace.setFormat)} />
        </fieldset>
        <p className="pa-note">输出 {workspace.size.width}×{workspace.size.height}。镜头晃动大的视频，会自动降低帧率压到 5MB 以内；想要更流畅可以缩短片段。</p>
      </Step>

      <div className="pa-cta">
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={!ready || locked} onClick={() => { onReset();void workspace.generate(); }}>
          {busy ? <IconHourglass width={16} height={16} aria-hidden="true" /> : <IconScissors width={16} height={16} aria-hidden="true" />}
          {busy ? "正在处理…" : "生成视频动图"}
        </button>
        {busy && <button type="button" className="btn btn--secondary" onClick={workspace.cancel}>取消</button>}
      </div>
      {busy && <div className="pa-progress" role="status">
        <div className="pa-progress__bar"><span style={{ width: `${workspace.progress}%` }} /></div>
        <p><span className="pa-spinner" aria-hidden="true" />{workspace.status || "正在处理…"}</p>
      </div>}
      {workspace.error && video && <p role="alert" className="pa-error"><IconAlert width={16} height={16} aria-hidden="true" /><span>{workspace.error}</span></p>}
    </section>

    <section className="pa-preview">
      <div className="pa-preview__bar">
        <div className="pa-preview__title"><strong>视频转动图</strong><span>{current ? "已按平台规格导出" : "片段循环播放，取景框内的画面就是动图内容"}</span></div>
        <span className={`pa-chip${current ? " pa-chip--success" : ""}`}>{current ? <IconCheck width={12} height={12} aria-hidden="true" /> : <IconVideo width={12} height={12} aria-hidden="true" />}{chip}</span>
        {(video || current) && <div className="pa-preview__tools">
          <button className="pa-icon-btn" type="button" aria-label={playing ? "暂停预览" : "播放预览"} title={playing ? "暂停预览" : "播放预览"} onClick={() => setPlaying((value) => !value)}>{playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}</button>
          {current && <button type="button" className="btn btn--secondary" onClick={onReset}>返回编辑</button>}
          {current && <button type="button" className="btn btn--primary" disabled={saving} onClick={() => onDownload(current)}><IconDownload width={15} height={15} aria-hidden="true" />下载 {current.media.format.toUpperCase()}</button>}
        </div>}
      </div>
      <div className="pa-stage">
        {current ? <img src={animationFileUrl(playing ? current.path : current.posterPath)} alt="生成的视频动图" />
          : video ? <VideoCropStage key={video.url} video={video} crop={workspace.crop} ratio={workspace.ratio} startMs={workspace.startMs} clipMs={clipMs} playing={playing && !busy} disabled={locked}
            onCrop={edit(workspace.setCrop)} onMetadata={workspace.onMetadata} onError={() => void workspace.onPlaybackError()} onTime={setCurrentMs} />
          : <div className="pa-empty">
            <span className="pa-empty__icon" aria-hidden="true"><IconVideo width={30} height={30} /></span>
            <strong>还没有视频</strong><p>在左侧粘贴小红书或抖音链接，或上传本机视频，这里会循环播放所选片段</p>
          </div>}
      </div>
      {current && <ResultMetrics result={current} />}
      <MerchantCopyCard text={ANIMATION_COPY_TEXT} successMessage="动图沟通文案已复制到剪贴板" />
    </section>
  </div>;
}
