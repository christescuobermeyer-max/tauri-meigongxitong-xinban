import { useState } from "react";
import {
  applyBrandStoryEntryUpdate,
  buildBrandStoryEntries,
  BRAND_STORY_IMAGE_CONFIGS,
  generateBrandStoryCopy,
  generateBrandStoryImage,
  getBrandStoryCompletedCount,
  hasBusyBrandStoryEntries,
  type BrandStoryImageEntry,
} from "../lib/brand-story";
import {
  downloadBrandStoryEntries,
  downloadBrandStoryEntry,
} from "../lib/brand-story-download";
import { getAutoRetryAttempt } from "../lib/generation-retry";
import type {
  AssetKind,
  BrandCopy,
  BrandStoryThreadId,
  GenerationItem,
  GenerationLine,
  Platform,
} from "../types";

const BRAND_STORY_PLATFORM: Platform = "meituan";
const BRAND_STORY_FIXED_THREAD: BrandStoryThreadId = "thread1";

interface Options {
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (
    kind: AssetKind,
    item: GenerationItem,
    shopName: string,
    platform: Platform
  ) => void;
}

export type BrandStoryPhase = "idle" | "text" | "image" | "done";

export default function useBrandStoryWorkspace({
  generationLine,
  setGenerationLine,
  onToast,
  onRecordHistory,
}: Options) {
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState("");
  const [copy, setCopy] = useState<BrandCopy | null>(null);
  const [entries, setEntries] = useState<BrandStoryImageEntry[]>(() =>
    buildBrandStoryEntries()
  );
  const [phase, setPhase] = useState<BrandStoryPhase>("idle");
  const [imageProgress, setImageProgress] = useState(0);
  const [textBusy, setTextBusy] = useState(false);

  const imagesBusy = hasBusyBrandStoryEntries(entries);
  const busy = textBusy || imagesBusy;
  const completedCount = getBrandStoryCompletedCount(entries);

  function validateInputs(): boolean {
    const trimmed = storeName.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      onToast("店铺名称需为 2-20 个字符", "error");
      return false;
    }
    if (!category.trim()) {
      onToast("请输入经营品类", "error");
      return false;
    }
    return true;
  }

  async function handleGenerate() {
    if (!validateInputs()) return;
    const snapshot = {
      storeName: storeName.trim(),
      category: category.trim(),
      threadId: BRAND_STORY_FIXED_THREAD,
      generationLine,
    };

    setCopy(null);
    setEntries(buildBrandStoryEntries("queued"));
    setImageProgress(0);
    setPhase("text");
    setTextBusy(true);
    onToast("正在构思品牌文案…", "info");

    let textResult: BrandCopy;
    try {
      textResult = await generateBrandStoryCopy(
        snapshot.storeName,
        snapshot.category,
        snapshot.threadId
      );
      setCopy(textResult);
      setTextBusy(false);
    } catch (error: unknown) {
      setTextBusy(false);
      setPhase("idle");
      setEntries(buildBrandStoryEntries("idle"));
      const message = error instanceof Error ? error.message : String(error);
      onToast(`品牌故事文案生成失败：${message}`, "error");
      return;
    }

    setPhase("image");
    onToast("文案生成完成，正在按顺序生成 5 张配图…", "info");

    for (const config of BRAND_STORY_IMAGE_CONFIGS) {
      setImageProgress(config.index);
      await runSingleImage(textResult, config.index, snapshot);
    }

    setPhase("done");
    onToast("品牌故事生成完成", "success");
  }

  async function handleRetryImage(index: number) {
    if (!validateInputs()) return;
    if (!copy) {
      onToast("请先生成文案后再重试配图", "error");
      return;
    }
    const snapshot = {
      storeName: storeName.trim(),
      category: category.trim(),
      threadId: BRAND_STORY_FIXED_THREAD,
      generationLine,
    };
    setImageProgress(index);
    await runSingleImage(copy, index, snapshot);
  }

  async function runSingleImage(
    currentCopy: BrandCopy,
    index: number,
    snapshot: {
      storeName: string;
      category: string;
      threadId: BrandStoryThreadId;
      generationLine: GenerationLine;
    }
  ) {
    const started = Date.now();
    setEntries((previous) =>
      applyBrandStoryEntryUpdate(previous, index, (item) => ({
        ...item,
        status: "running",
        errorMessage: undefined,
      }))
    );

    try {
      const item = await generateBrandStoryImage({
        index,
        copy: currentCopy,
        storeName: snapshot.storeName,
        category: snapshot.category,
        generationLine: snapshot.generationLine,
        onAttempt: (attempt) =>
          setEntries((previous) =>
            applyBrandStoryEntryUpdate(previous, index, (current) => ({
              ...current,
              status: "running",
              errorMessage: undefined,
              attempt,
            }))
          ),
      });
      const itemWithElapsed = { ...item, elapsedMs: Date.now() - started };
      onRecordHistory("brand_story", itemWithElapsed, snapshot.storeName, BRAND_STORY_PLATFORM);
      setEntries((previous) =>
        applyBrandStoryEntryUpdate(previous, index, itemWithElapsed)
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = getAutoRetryAttempt(error);
      setEntries((previous) =>
        applyBrandStoryEntryUpdate(previous, index, (item) => ({
          ...item,
          status: "failed",
          errorMessage: message,
          attempt: attempt ?? item.attempt,
        }))
      );
      onToast(`品牌故事第 ${index} 张图生成失败：${message}`, "error");
    }
  }

  async function handleDownload() {
    try {
      const saved = await downloadBrandStoryEntries(entries, storeName);
      if (!saved || saved.length === 0) return;
      onToast(`品牌故事配图下载完成，已保存 ${saved.length} 张`, "success");
    } catch (error: unknown) {
      onToast(
        `品牌故事下载失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  async function handleDownloadItem(index: number) {
    const entry = entries.find((item) => item.index === index);
    if (!entry) return;
    try {
      const saved = await downloadBrandStoryEntry(entry, storeName);
      if (saved) onToast(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      onToast(
        `品牌故事下载失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  return {
    generationLine,
    setGenerationLine,
    storeName,
    setStoreName,
    category,
    setCategory,
    copy,
    entries,
    busy,
    textBusy,
    imagesBusy,
    phase,
    imageProgress,
    completedCount,
    handleGenerate,
    handleRetryImage,
    handleDownload,
    handleDownloadItem,
  };
}
