import { useEffect, useRef, useState } from "react";
import { ensureTauriInvoke } from "../lib/desktop/invoke";
import { hasAnimationDesktop, type AnimationResult } from "../lib/product-animation/desktop";
import { chooseVideoAnimationSize, validateAnimation, VIDEO_ANIMATION_STYLE, type AnimationFormat, type AnimationRatio } from "../lib/product-animation/policy";
import { availableClipLengths, clampClipStart, initialCrop, MIN_VIDEO_SECONDS, type VideoCrop } from "../lib/product-animation/video";
import { animationVideoUrl, pickAnimationVideo, transcodeAnimationVideo } from "../lib/product-animation/video-desktop";

export interface AnimationVideo { path: string; name: string; url: string; transcoded: boolean; width: number; height: number; durationMs: number }

const message = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);
const fileName = (path: string) => path.split(/[\\/]/).pop() || "视频";

/** Cuts a 2–5 s clip from a local video into a platform animation, using the shared encoder session. */
export default function useVideoAnimation(userId: string, onResult: (result: AnimationResult) => void) {
  const [video, setVideo] = useState<AnimationVideo | null>(null);
  const [loading, setLoading] = useState(false);
  const [ratio, setRatioState] = useState<AnimationRatio>("4:3");
  const [format, setFormat] = useState<AnimationFormat>("gif");
  const [clipMs, setClipState] = useState(3000);
  const [startMs, setStartState] = useState(0);
  const [crop, setCrop] = useState<VideoCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const session = useRef<string | null>(null);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const size = chooseVideoAnimationSize(ratio);
  const ready = Boolean(video && video.width && crop);

  async function pick() {
    if (busy || loading) return;
    if (!hasAnimationDesktop()) { setError("请在桌面应用内选择视频");return; }
    const run = ++sequence.current;
    try {
      const path = await pickAnimationVideo();
      if (!path || run !== sequence.current) return;
      setLoading(true);setError("");setStatus("正在载入视频…");
      const url = await animationVideoUrl(path);
      if (run !== sequence.current || !mounted.current) return;
      setVideo({ path, name: fileName(path), url, transcoded: false, width: 0, height: 0, durationMs: 0 });
      setCrop(null);setStartState(0);
    } catch (reason) {
      if (run === sequence.current && mounted.current) { setError(message(reason));setLoading(false);setStatus(""); }
    }
  }

  /** Called by the preview <video> once dimensions and duration are known. */
  function onMetadata(width: number, height: number, durationSeconds: number) {
    if (!video || video.width) return;
    setLoading(false);setStatus("");
    const durationMs = Math.floor(durationSeconds * 1000);
    if (!width || !height || !Number.isFinite(durationMs) || durationMs < MIN_VIDEO_SECONDS * 1000) {
      setVideo(null);setError(`视频需要至少 ${MIN_VIDEO_SECONDS} 秒，请换一个视频`);return;
    }
    const nextRatio: AnimationRatio = width / height > 1.55 ? "16:9" : "4:3";
    const lengths = availableClipLengths(durationMs);
    setVideo({ ...video, width, height, durationMs });
    setRatioState(nextRatio);setCrop(initialCrop(width, height, nextRatio));
    setClipState((current) => lengths.includes(current) ? current : lengths[lengths.length - 1]);
    setStartState(0);
  }

  /** The webview cannot decode some codecs; fall back to an H.264 preview once. */
  async function onPlaybackError() {
    if (!video) return;
    if (video.transcoded) { setVideo(null);setLoading(false);setStatus("");setError("这个视频无法读取，请换成 MP4 后重试");return; }
    const run = sequence.current;
    setLoading(true);setStatus("当前格式无法直接预览，正在转码…");
    try {
      const url = await transcodeAnimationVideo(video.path);
      if (run === sequence.current && mounted.current) setVideo({ ...video, url, transcoded: true });
    } catch (reason) {
      if (run === sequence.current && mounted.current) { setVideo(null);setLoading(false);setStatus("");setError(message(reason)); }
    }
  }

  function setRatio(next: AnimationRatio) {
    setRatioState(next);
    if (video?.width) setCrop(initialCrop(video.width, video.height, next));
  }
  function setClip(next: number) {
    setClipState(next);
    if (video) setStartState((start) => clampClipStart(start, next, video.durationMs));
  }
  function setStart(next: number) {
    if (video) setStartState(clampClipStart(next, clipMs, video.durationMs));
  }

  async function generate() {
    if (busy || !video || !crop || !video.width) return;
    if (!hasAnimationDesktop()) { setError("请在桌面应用内生成和导出");return; }
    cancelled.current = false;setBusy(true);setError("");setProgress(10);setStatus("正在截取视频画面…");
    try {
      const spec = { width: size.width, height: size.height, durationMs: clipMs, format, style: VIDEO_ANIMATION_STYLE };
      const id = await ensureTauriInvoke()<string>("begin_product_animation", { userId, spec });
      session.current = id;
      await ensureTauriInvoke()("extract_product_animation_video", { id, clip: { inputPath: video.path, startMs, ...crop } });
      if (cancelled.current) throw new Error("已取消制作");
      if (mounted.current) { setProgress(60);setStatus("正在压缩并检查比例、时长和体积…"); }
      const result = await ensureTauriInvoke()<AnimationResult>("finish_product_animation", { id });
      const errors = validateAnimation(result.media);
      if (errors.length) throw new Error(errors.join("；"));
      if (!mounted.current) return;
      setProgress(100);onResult(result);
    } catch (reason) {
      if (mounted.current) setError(message(reason));
    } finally {
      if (session.current) await ensureTauriInvoke()("cancel_product_animation", { id: session.current }).catch(() => undefined);
      session.current = null;
      if (mounted.current) { setBusy(false);setStatus("");setProgress(0); }
    }
  }

  function cancel() {
    cancelled.current = true;
    if (session.current) void ensureTauriInvoke()("cancel_product_animation", { id: session.current }).catch(() => undefined);
  }

  useEffect(() => {
    mounted.current = true;
    setVideo(null);setCrop(null);setError("");setBusy(false);setLoading(false);
    return () => {
      mounted.current = false;cancelled.current = true;sequence.current++;
      if (session.current) void ensureTauriInvoke()("cancel_product_animation", { id: session.current }).catch(() => undefined);
    };
  }, [userId]);

  return { video, loading, ready, ratio, setRatio, format, setFormat, clipMs, setClip, startMs, setStart, crop, setCrop, size,
    busy, progress, status, error, setError, pick, onMetadata, onPlaybackError, generate, cancel };
}
export type VideoAnimationWorkspace = ReturnType<typeof useVideoAnimation>;
