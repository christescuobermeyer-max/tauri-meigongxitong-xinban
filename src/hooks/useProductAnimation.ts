import { useCallback, useEffect, useRef, useState } from "react";
import { ensureTauriInvoke } from "../lib/desktop/invoke";
import { downloadOssImageAsBase64 } from "../lib/oss-image-download";
import { chooseAnimationSize, validateAnimation, type AnimationFormat, type AnimationRatio, type AnimationStyle } from "../lib/product-animation/policy";
import { createAnimationRenderer } from "../lib/product-animation/render";
import { ANIMATION_SOURCE_EVENT, type AnimationSourceRequest } from "../lib/product-animation/source";
import { hasAnimationDesktop, listAnimations, type AnimationResult } from "../lib/product-animation/desktop";

export default function useProductAnimation(userId: string, onOpen: () => void) {
  const [source, setSource] = useState<{ image: HTMLImageElement; name: string } | null>(null);
  const [style, setStyle] = useState<AnimationStyle>("steam");
  const [ratio, setRatio] = useState<AnimationRatio>("4:3");
  const [format, setFormat] = useState<AnimationFormat>("gif");
  const [duration, setDuration] = useState(3000);
  const [busy, setBusy] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [results, setResults] = useState<AnimationResult[]>([]);
  const [current, setCurrent] = useState<AnimationResult | null>(null);
  const working = useRef(false);
  const cancelled = useRef(false);
  const session = useRef<string | null>(null);
  const sourceSequence = useRef(0);
  const mounted = useRef(true);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const size = source ? chooseAnimationSize(source.image.naturalWidth, source.image.naturalHeight, ratio) : null;

  useEffect(() => {
    mounted.current = true;
    if (hasAnimationDesktop()) listAnimations(userId).then(setResults).catch((reason) => setError(String(reason)));
    return () => {
      mounted.current = false;cancelled.current = true;sourceSequence.current++;
      if (sourceRef.current) sourceRef.current.src = "";
      if (session.current) void ensureTauriInvoke()("cancel_product_animation", { id: session.current });
    };
  }, [userId]);

  const loadSource = useCallback(async (request: AnimationSourceRequest | File) => {
    if (working.current) return;
    const sequence = ++sourceSequence.current;
    setLoadingSource(true);setError("");setCurrent(null);
    let objectUrl: string | null = null;
    try {
      let url: string;
      let name: string;
      if (request instanceof File) {
        if (!request.type.startsWith("image/") || request.size > 20_000_000) throw new Error("请选择20MB以内的静态菜品图片");
        url = objectUrl = URL.createObjectURL(request);name = request.name;
      } else {
        name = request.name;
        url = request.url.startsWith("data:image/") ? request.url : (await downloadOssImageAsBase64(request.url)).dataUrl;
      }
      const image = new Image();
      image.src = url;
      await image.decode();
      if (sequence !== sourceSequence.current || !mounted.current) return;
      if (image.naturalWidth * image.naturalHeight > 24_000_000 || !image.naturalWidth) throw new Error("原图像素过大，请使用2400万像素以内的图片");
      if (sourceRef.current) sourceRef.current.src = "";
      sourceRef.current = image;
      setSource({ image, name });
      setRatio(image.naturalWidth / image.naturalHeight > 1.55 ? "16:9" : "4:3");
    } catch (reason) {
      if (sequence === sourceSequence.current && mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (sequence === sourceSequence.current && mounted.current) setLoadingSource(false);
    }
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      if (working.current) return;
      onOpen();void loadSource((event as CustomEvent<AnimationSourceRequest>).detail);
    };
    window.addEventListener(ANIMATION_SOURCE_EVENT, handler);
    return () => window.removeEventListener(ANIMATION_SOURCE_EVENT, handler);
  }, [loadSource, onOpen]);

  async function generate() {
    if (!source || !size || working.current || loadingSource) return;
    if (!hasAnimationDesktop()) { setError("请在桌面应用内生成和导出；浏览器可预览风格。");return; }
    working.current = true;cancelled.current = false;setBusy(true);setProgress(0);setError("");setCurrent(null);
    const canvas = document.createElement("canvas");
    try {
      const spec = { width: size.width, height: size.height, durationMs: duration, format, style };
      const id = await ensureTauriInvoke()<string>("begin_product_animation", { userId, spec });
      session.current = id;
      const render = createAnimationRenderer(source.image, size.width, size.height, style);
      const frameCount = duration / 50;
      for (let index = 0; index < frameCount; index++) {
        if (cancelled.current) throw new Error("已取消制作");
        render(canvas, index / frameCount);
        await ensureTauriInvoke()("append_product_animation_frame", { id, index, png: canvas.toDataURL("image/png").split(",")[1] });
        if (mounted.current) setProgress(Math.round((index + 1) / frameCount * 80));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (cancelled.current) throw new Error("已取消制作");
      const result = await ensureTauriInvoke()<AnimationResult>("finish_product_animation", { id });
      const errors = validateAnimation(result.media);
      if (errors.length) throw new Error(errors.join("；"));
      if (mounted.current) { setCurrent(result);setResults((previous) => [result, ...previous].slice(0, 50));setProgress(100); }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (session.current) await ensureTauriInvoke()("cancel_product_animation", { id: session.current }).catch(() => undefined);
      session.current = null;working.current = false;canvas.width = 1;canvas.height = 1;
      if (mounted.current) setBusy(false);
    }
  }

  function cancel() {
    cancelled.current = true;
    if (session.current) void ensureTauriInvoke()("cancel_product_animation", { id: session.current }).catch(() => undefined);
  }

  return { userId, source, style, setStyle, ratio, setRatio, format, setFormat, duration, setDuration, busy, loadingSource, progress, error, setError,
    results, current, setCurrent, size, loadSource, generate, cancel };
}
export type ProductAnimationWorkspace = ReturnType<typeof useProductAnimation>;
