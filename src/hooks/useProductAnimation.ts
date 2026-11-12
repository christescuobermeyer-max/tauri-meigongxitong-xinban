import { useCallback, useEffect, useRef, useState } from "react";
import { ensureTauriInvoke } from "../lib/desktop/invoke";
import { downloadOssImageAsBase64 } from "../lib/oss-image-download";
import { chooseAnimationSize, validateAnimation, type AnimationFormat, type AnimationRatio, type AnimationStyle } from "../lib/product-animation/policy";
import { createAnimationRenderer } from "../lib/product-animation/render";
import { ANIMATION_SOURCE_EVENT, type AnimationSourceRequest } from "../lib/product-animation/source";
import { hasAnimationDesktop, listAnimations, type AnimationResult } from "../lib/product-animation/desktop";
import { fetchModelJobs, importModelJob, modelJobActive, modelRequest, sourcePng, type ModelJob, type ModelSpec } from "../lib/product-animation/cloud";

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
  const [cloudJobs, setCloudJobs] = useState<ModelJob[]>([]);
  const [modelEnabled, setModelEnabled] = useState(false);
  const [modelStatus, setModelStatus] = useState("正在检查模型动图服务…");
  const [cloudSubmitting, setCloudSubmitting] = useState(false);
  const pendingKey = `csgh-animation-pending:${userId}`;
  const [pendingId, setPendingId] = useState(() => localStorage.getItem(pendingKey));
  const working = useRef(false);
  const cancelled = useRef(false);
  const session = useRef<string | null>(null);
  const sourceSequence = useRef(0);
  const mounted = useRef(true);
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const cloudRefreshSequence = useRef(0);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const sourceSize = source ? chooseAnimationSize(source.image.naturalWidth, source.image.naturalHeight, ratio) : null;
  const size = sourceSize && style === "steam" && (sourceSize.width % 16 || sourceSize.height % 16)
    ? { width: 1024, height: ratio === "4:3" ? 768 : 576, adjusted: true } : sourceSize;

  const refreshCloudJobs = useCallback(async () => {
    const sequence = ++cloudRefreshSequence.current;
    try {
      const jobs = await fetchModelJobs();
      if (!mounted.current || activeUser.current !== userId || sequence !== cloudRefreshSequence.current) return;
      setCloudJobs(jobs);
      const pending = localStorage.getItem(`csgh-animation-pending:${userId}`);
      if (pending && jobs.some((job) => job.id === pending)) {
        localStorage.removeItem(`csgh-animation-pending:${userId}`);setPendingId(null);
      }
      setModelStatus("");
    } catch (reason) { if (mounted.current && activeUser.current === userId && sequence === cloudRefreshSequence.current) setModelStatus(reason instanceof Error ? reason.message : String(reason)); }
  }, [userId]);

  useEffect(() => {
    let live = true;
    setPendingId(localStorage.getItem(pendingKey));setCloudJobs([]);setModelEnabled(false);
    void modelRequest<{ enabled: boolean }>("capabilities").then((value) => {
      if (!live) return;
      setModelEnabled(value.enabled);
      if (!value.enabled) setModelStatus("模型动图暂未开放；已有云端任务仍可查询。");
    }).catch((reason) => { if (live) setModelStatus(reason instanceof Error ? reason.message : String(reason)); });
    void refreshCloudJobs();
    const timer = window.setInterval(() => void refreshCloudJobs(), 15000);
    return () => { live = false;window.clearInterval(timer); };
  }, [pendingKey, refreshCloudJobs]);

  async function generateModel() {
    if (!source || !size || working.current || cloudJobs.some(modelJobActive)) return;
    if (!hasAnimationDesktop()) { setError("请在桌面应用内生成模型动图。");return; }
    if (!modelEnabled) { setError("模型动图暂未开放，请先检查云端服务。");return; }
    const spec: ModelSpec = { width: size.width, height: size.height, durationMs: duration, format, style: "steam" };
    if (spec.width % 16 || spec.height % 16) { setError("模型要求宽高为16的倍数，请使用1024×768或1024×576画布。");return; }
    working.current = true;setCloudSubmitting(true);setError("");setCurrent(null);
    try {
      const png = sourcePng(source.image, spec);
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(png + JSON.stringify(spec))))).map((value) => value.toString(16).padStart(2, "0")).join("");
      if (pendingId && localStorage.getItem(`${pendingKey}:hash`) !== fingerprint) throw new Error("上次请求尚未确认。重试时请使用同一张原图和参数，或先刷新任务状态。");
      const id = pendingId || crypto.randomUUID();
      localStorage.setItem(`${pendingKey}:hash`, fingerprint);localStorage.setItem(pendingKey, id);setPendingId(id);
      const job = await modelRequest<ModelJob>("jobs", { id, sourcePng: png, spec });
      localStorage.removeItem(pendingKey);localStorage.removeItem(`${pendingKey}:hash`);
      if (mounted.current && activeUser.current === userId) { setPendingId(null);setCloudJobs((previous) => [job, ...previous.filter((entry) => entry.id !== job.id)]); }
    } catch (reason) { if (mounted.current && activeUser.current === userId) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { working.current = false;if (mounted.current && activeUser.current === userId) setCloudSubmitting(false); }
  }

  async function openModelJob(id: string) {
    if (working.current) return;
    working.current = true;setCloudSubmitting(true);setError("");
    try {
      const result = await importModelJob(userId, id);
      if (mounted.current && activeUser.current === userId) { setCurrent(result);setResults((previous) => [result, ...previous.filter((entry) => entry.id !== result.id)].slice(0, 50)); }
    } catch (reason) { if (mounted.current && activeUser.current === userId) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { working.current = false;if (mounted.current && activeUser.current === userId) setCloudSubmitting(false); }
  }

  useEffect(() => {
    mounted.current = true;
    setResults([]);setCurrent(null);setSource(null);setBusy(false);setCloudSubmitting(false);
    if (hasAnimationDesktop()) listAnimations(userId).then((items) => { if (mounted.current && activeUser.current === userId) setResults(items); }).catch((reason) => { if (mounted.current && activeUser.current === userId) setError(String(reason)); });
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
    if (style === "steam") { await generateModel();return; }
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

  return { userId, source, style, setStyle, ratio, setRatio, format, setFormat, duration, setDuration, busy: busy || cloudSubmitting, loadingSource, progress, error, setError,
    cloudJobs, cloudActive: cloudJobs.some(modelJobActive), modelEnabled, modelStatus, pendingId, cloudSubmitting, refreshCloudJobs, openModelJob,
    results, current, setCurrent, size, loadSource, generate, cancel };
}
export type ProductAnimationWorkspace = ReturnType<typeof useProductAnimation>;
