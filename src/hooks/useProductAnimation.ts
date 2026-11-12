import { useCallback, useEffect, useRef, useState } from "react";
import { ensureTauriInvoke } from "../lib/desktop/invoke";
import { downloadOssImageAsBase64 } from "../lib/oss-image-download";
import { ANIMATION_STYLES, chooseAnimationSize, validateAnimation, type AnimationFormat, type AnimationRatio, type AnimationStyle } from "../lib/product-animation/policy";
import { createAnimationRenderer } from "../lib/product-animation/render";
import { loadAnimationFonts } from "../lib/product-animation/fonts";
import { ANIMATION_SOURCE_EVENT, type AnimationSourceRequest } from "../lib/product-animation/source";
import { clearAnimations, hasAnimationDesktop, listAnimations, saveAllAnimations, type AnimationResult } from "../lib/product-animation/desktop";

export const MAX_ANIMATION_ITEMS = 5;
export type AnimationItemStatus = "idle" | "running" | "done" | "failed";
export interface AnimationItem { key: string; image: HTMLImageElement; name: string; style: AnimationStyle | null; status: AnimationItemStatus; result?: AnimationResult; error?: string }

/** Thrown when the user stops the batch. */
class StopQueue extends Error {}

function canvasSize(image: HTMLImageElement, ratio: AnimationRatio) {
  return chooseAnimationSize(image.naturalWidth, image.naturalHeight, ratio);
}

const message = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

export default function useProductAnimation(userId: string, onOpen: () => void) {
  const [items, setItems] = useState<AnimationItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sharedStyle, setSharedStyle] = useState<AnimationStyle>(ANIMATION_STYLES[0].id);
  const [styleScope, setStyleScope] = useState<"all" | "one">("all");
  const [ratio, setRatioState] = useState<AnimationRatio>("4:3");
  const [format, setFormatState] = useState<AnimationFormat>("gif");
  const [duration, setDurationState] = useState(3000);
  const [busy, setBusy] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [progress, setProgress] = useState(0);
  const [queueStatus, setQueueStatus] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<AnimationResult[]>([]);
  const [current, setCurrent] = useState<AnimationResult | null>(null);
  const working = useRef(false);
  const cancelled = useRef(false);
  const session = useRef<string | null>(null);
  const sourceSequence = useRef(0);
  const mounted = useRef(true);
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const itemCount = useRef(0);
  itemCount.current = items.length;

  const selected = items.find((item) => item.key === selectedKey) ?? items[0] ?? null;
  const source = selected ? { image: selected.image, name: selected.name } : null;
  const style = selected?.style ?? sharedStyle;
  const size = selected ? canvasSize(selected.image, ratio) : null;
  const live = () => mounted.current && activeUser.current === userId;
  const updateItem = (key: string, patch: Partial<AnimationItem>) => setItems((previous) => previous.map((item) => item.key === key ? { ...item, ...patch } : item));
  // Changing an output setting means finished items no longer match; mark them for regeneration.
  const resetDone = (keep?: (item: AnimationItem) => boolean) => setItems((previous) => previous.map((item) => item.status === "done" && !keep?.(item) ? { ...item, status: "idle", result: undefined } : item));

  function setStyle(next: AnimationStyle) {
    if (styleScope === "one" && selected && items.length > 1) {
      if (selected.style === next) return;
      updateItem(selected.key, { style: next, status: selected.status === "running" ? "running" : "idle", result: undefined, error: undefined });
    } else {
      setSharedStyle(next);
      setItems((previous) => previous.map((item) => (item.style ?? sharedStyle) === next ? { ...item, style: null }
        : { ...item, style: null, status: item.status === "running" ? "running" : "idle", result: undefined, error: undefined }));
    }
  }
  const setRatio = (value: AnimationRatio) => { setRatioState(value);resetDone(); };
  const setFormat = (value: AnimationFormat) => { setFormatState(value);resetDone(); };
  const setDuration = (value: number) => { setDurationState(value);resetDone(); };

  async function runLocal(item: AnimationItem, itemStyle: AnimationStyle, label: string): Promise<AnimationResult> {
    const size = canvasSize(item.image, ratio);
    const canvas = document.createElement("canvas");
    try {
      const spec = { width: size.width, height: size.height, durationMs: duration, format, style: itemStyle };
      const id = await ensureTauriInvoke()<string>("begin_product_animation", { userId, spec });
      session.current = id;
      await loadAnimationFonts();
      const render = createAnimationRenderer(item.image, size.width, size.height, itemStyle);
      const frameCount = duration / 50;
      for (let index = 0; index < frameCount; index++) {
        if (cancelled.current) throw new StopQueue("已取消制作");
        render(canvas, index / frameCount);
        await ensureTauriInvoke()("append_product_animation_frame", { id, index, png: canvas.toDataURL("image/png").split(",")[1] });
        const percent = Math.round((index + 1) / frameCount * 80);
        if (mounted.current) { setProgress(percent);setQueueStatus(`${label}正在绘制动画 ${percent}%`); }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (cancelled.current) throw new StopQueue("已取消制作");
      if (mounted.current) setQueueStatus(`${label}正在压缩并检查比例、时长和体积…`);
      const result = await ensureTauriInvoke()<AnimationResult>("finish_product_animation", { id });
      const errors = validateAnimation(result.media);
      if (errors.length) throw new Error(errors.join("；"));
      if (mounted.current) setProgress(100);
      return result;
    } finally {
      if (session.current) await ensureTauriInvoke()("cancel_product_animation", { id: session.current }).catch(() => undefined);
      session.current = null;canvas.width = 1;canvas.height = 1;
    }
  }

  /** Generates every unfinished item one after another. */
  async function generate() {
    if (working.current || loadingSource || !items.length) return;
    if (!hasAnimationDesktop()) { setError("请在桌面应用内生成和导出；浏览器可预览风格。");return; }
    const unfinished = items.filter((item) => item.status !== "done");
    const queue = unfinished.length ? unfinished : items;
    working.current = true;cancelled.current = false;setBusy(true);setProgress(0);setError("");setCurrent(null);
    const failures: string[] = [];
    try {
      for (const [index, item] of queue.entries()) {
        if (cancelled.current || !mounted.current) break;
        const itemStyle = item.style ?? sharedStyle;
        const label = queue.length > 1 ? `第 ${index + 1}/${queue.length} 张：` : "";
        setSelectedKey(item.key);setCurrent(null);setProgress(0);updateItem(item.key, { status: "running", error: undefined });
        try {
          const result = await runLocal(item, itemStyle, label);
          if (!live()) return;
          updateItem(item.key, { status: "done", result });
          setResults((previous) => [result, ...previous.filter((entry) => entry.id !== result.id)].slice(0, 50));
          setCurrent(result);
        } catch (reason) {
          if (!live()) return;
          updateItem(item.key, { status: "failed", error: message(reason) });
          failures.push(queue.length > 1 ? `${item.name}：${message(reason)}` : message(reason));
          if (reason instanceof StopQueue) break;
        }
      }
      if (live() && failures.length) setError(failures.join("\n"));
    } finally {
      working.current = false;
      if (mounted.current) { setBusy(false);setQueueStatus(""); }
    }
  }

  function cancel() {
    cancelled.current = true;
    if (session.current) void ensureTauriInvoke()("cancel_product_animation", { id: session.current }).catch(() => undefined);
  }

  /** Deletes every locally stored animation; returns null when it could not run. */
  async function clearAll() {
    if (working.current) return null;
    try {
      const cleanup = await clearAnimations(userId);
      if (!live()) return null;
      setResults([]);setCurrent(null);
      setItems((previous) => previous.map((item) => item.status === "done" ? { ...item, status: "idle", result: undefined } : item));
      return cleanup;
    } catch (reason) { if (live()) setError(message(reason));return null; }
  }

  async function downloadAll() {
    const done = items.flatMap((item) => item.status === "done" && item.result ? [item.result] : []);
    if (!done.length) return 0;
    try { return await saveAllAnimations(userId, done); }
    catch (reason) { setError(message(reason));return 0; }
  }

  useEffect(() => {
    mounted.current = true;
    setResults([]);setCurrent(null);setItems([]);setSelectedKey(null);setBusy(false);
    if (hasAnimationDesktop()) listAnimations(userId).then((entries) => { if (mounted.current && activeUser.current === userId) setResults(entries); }).catch((reason) => { if (mounted.current && activeUser.current === userId) setError(String(reason)); });
    return () => {
      mounted.current = false;cancelled.current = true;sourceSequence.current++;
      if (session.current) void ensureTauriInvoke()("cancel_product_animation", { id: session.current });
    };
  }, [userId]);

  const loadSource = useCallback(async (request: AnimationSourceRequest | File | File[]) => {
    if (working.current) return;
    const requests = Array.isArray(request) ? request : [request];
    const room = MAX_ANIMATION_ITEMS - itemCount.current;
    if (room <= 0) { setError(`最多同时制作 ${MAX_ANIMATION_ITEMS} 张，请先移除不需要的图片。`);return; }
    const sequence = ++sourceSequence.current;
    const wasEmpty = itemCount.current === 0;
    setLoadingSource(true);setError(requests.length > room ? `最多同时制作 ${MAX_ANIMATION_ITEMS} 张，已忽略多出的 ${requests.length - room} 张。` : "");setCurrent(null);
    const added: AnimationItem[] = [];
    try {
      for (const entry of requests.slice(0, room)) {
        let objectUrl: string | null = null;
        try {
          let url: string;
          let name: string;
          if (entry instanceof File) {
            if (!entry.type.startsWith("image/") || entry.size > 20_000_000) throw new Error(`${entry.name}：请选择20MB以内的静态菜品图片`);
            url = objectUrl = URL.createObjectURL(entry);name = entry.name;
          } else {
            name = entry.name;
            url = entry.url.startsWith("data:image/") ? entry.url : (await downloadOssImageAsBase64(entry.url)).dataUrl;
          }
          const image = new Image();
          image.src = url;
          await image.decode();
          if (image.naturalWidth * image.naturalHeight > 24_000_000 || !image.naturalWidth) throw new Error(`${name}：原图像素过大，请使用2400万像素以内的图片`);
          added.push({ key: crypto.randomUUID(), image, name, style: null, status: "idle" });
        } catch (reason) {
          if (sequence === sourceSequence.current && mounted.current) setError(message(reason));
        } finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
      }
      if (sequence !== sourceSequence.current || !mounted.current || !added.length) return;
      setItems((previous) => [...previous, ...added].slice(0, MAX_ANIMATION_ITEMS));
      setSelectedKey(added[0].key);
      if (wasEmpty) setRatioState(added[0].image.naturalWidth / added[0].image.naturalHeight > 1.55 ? "16:9" : "4:3");
    } finally {
      if (sequence === sourceSequence.current && mounted.current) setLoadingSource(false);
    }
  }, []);

  function selectItem(key: string) {
    setSelectedKey(key);
    setCurrent(items.find((item) => item.key === key)?.result ?? null);
  }
  function removeItem(key: string) {
    if (working.current) return;
    setItems((previous) => previous.filter((item) => item.key !== key));
    if (selected?.key === key) { setSelectedKey(null);setCurrent(null); }
  }

  useEffect(() => {
    const handler = (event: Event) => {
      if (working.current) return;
      onOpen();void loadSource((event as CustomEvent<AnimationSourceRequest>).detail);
    };
    window.addEventListener(ANIMATION_SOURCE_EVENT, handler);
    return () => window.removeEventListener(ANIMATION_SOURCE_EVENT, handler);
  }, [loadSource, onOpen]);

  return { userId, source, style, setStyle, sharedStyle, styleScope, setStyleScope, ratio, setRatio, format, setFormat, duration, setDuration, busy, loadingSource, progress, queueStatus, error, setError,
    results, current, setCurrent, size, loadSource, generate, cancel, items, selectedKey: selected?.key ?? null, selectItem, removeItem, downloadAll, clearAll };
}
export type ProductAnimationWorkspace = ReturnType<typeof useProductAnimation>;
