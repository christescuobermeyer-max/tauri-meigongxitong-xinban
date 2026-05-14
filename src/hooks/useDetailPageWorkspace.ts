import { useEffect, useState } from "react";
import {
  applyDetailPageEntryUpdate,
  buildDetailPageEntries,
  generateDetailPageItem,
  getDetailPageCompletedCount,
  hasBusyDetailPageEntries,
  type DetailPageEntry,
} from "../lib/detail-page";
import { downloadDetailPageEntries, downloadDetailPageEntry } from "../lib/detail-page-download";
import { getAutoRetryAttempt } from "../lib/generation-retry";
import type {
  AssetKind,
  GenerationItem,
  GenerationLine,
  Platform,
  UploadedImage,
} from "../types";

const DETAIL_PAGE_PLATFORM: Platform = "meituan";

interface Options {
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (
    kind: AssetKind,
    item: GenerationItem,
    shopName: string,
    platform: Platform
  ) => void;
}

export default function useDetailPageWorkspace({
  generationLine,
  onToast,
  onRecordHistory,
}: Options) {
  const [shopName, setShopName] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [entries, setEntries] = useState<DetailPageEntry[]>(() => buildDetailPageEntries());

  useEffect(() => {
    if (images.length === 0) setEntries(buildDetailPageEntries());
  }, [images]);

  const busy = hasBusyDetailPageEntries(entries);
  const completedCount = getDetailPageCompletedCount(entries);

  function validateInputs() {
    if (!shopName.trim()) {
      onToast("请输入店铺名称", "error");
      return false;
    }
    if (images.length !== 1) {
      onToast("请上传 1 张产品图片", "error");
      return false;
    }
    return true;
  }

  async function handleGenerate() {
    if (!validateInputs()) return;
    const sourceImage = images[0];

    const snapshot = {
      shopName: shopName.trim(),
      generationLine,
    };

    setEntries(buildDetailPageEntries("queued"));
    onToast("正在按顺序生成 3 张详情页图，请耐心等待…", "info");

    for (const entry of buildDetailPageEntries("queued")) {
      await runSingle(sourceImage, entry.pageIndex, snapshot);
    }

    onToast("详情页图已生成完成", "success");
  }

  async function handleRetry(pageIndex: number) {
    if (!validateInputs()) return;
    const snapshot = {
      shopName: shopName.trim(),
      generationLine,
    };
    await runSingle(images[0], pageIndex, snapshot);
  }

  async function runSingle(
    sourceImage: UploadedImage,
    pageIndex: number,
    snapshot: { shopName: string; generationLine: GenerationLine }
  ) {
    const started = Date.now();
    setEntries((previous) =>
      applyDetailPageEntryUpdate(previous, pageIndex, (item) => ({
        ...item,
        status: "running",
        errorMessage: undefined,
      }))
    );

    try {
      const item = await generateDetailPageItem(
        sourceImage,
        snapshot.shopName,
        pageIndex,
        snapshot.generationLine,
        {
          onAttempt: (attempt) =>
            setEntries((previous) =>
              applyDetailPageEntryUpdate(previous, pageIndex, (current) => ({
                ...current,
                status: "running",
                errorMessage: undefined,
                attempt,
              }))
            ),
        }
      );
      const itemWithElapsed = { ...item, elapsedMs: Date.now() - started };
      onRecordHistory("detail_page", itemWithElapsed, snapshot.shopName, DETAIL_PAGE_PLATFORM);
      setEntries((previous) => applyDetailPageEntryUpdate(previous, pageIndex, itemWithElapsed));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = getAutoRetryAttempt(error);
      setEntries((previous) =>
        applyDetailPageEntryUpdate(previous, pageIndex, (item) => ({
          ...item,
          status: "failed",
          errorMessage: message,
          attempt: attempt ?? item.attempt,
        }))
      );
      onToast(`详情页第 ${pageIndex + 1} 张生成失败：${message}`, "error");
    }
  }

  async function handleDownload() {
    try {
      const saved = await downloadDetailPageEntries(entries, shopName);
      if (!saved || saved.length === 0) return;
      onToast(`详情页图片下载完成，已保存 ${saved.length} 张`, "success");
    } catch (error: unknown) {
      onToast(`详情页下载失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function handleDownloadItem(pageIndex: number) {
    const entry = entries.find((item) => item.pageIndex === pageIndex);
    if (!entry) return;
    try {
      const saved = await downloadDetailPageEntry(entry, shopName);
      if (saved) onToast(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      onToast(`详情页下载失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  return {
    shopName,
    setShopName,
    images,
    setImages,
    entries,
    busy,
    completedCount,
    handleGenerate,
    handleRetry,
    handleDownload,
    handleDownloadItem,
  };
}
