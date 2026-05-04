import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import usePSignboardWorkspace from "./usePSignboardWorkspace";
import usePictureWallWorkspace from "./usePictureWallWorkspace";
import useProductBatchWorkspace from "./useProductBatchWorkspace";
import { getAvatarGenerationErrorMessage } from "../lib/avatar-generation";
import {
  cleanupExpiredGenerationLogs,
  fetchGenerationLogs,
  fetchTodayCount,
  recordGenerationLog,
} from "../lib/cloud-history";
import { canBatchDownloadAssets } from "../lib/generated-asset-files";
import { getAvatarStorefrontPosterSequence } from "../lib/generation-sequence";
import { markGenerationLogRecorded } from "../lib/generation-log-dedupe";
import {
  appendHistoryEntry,
  buildHistoryEntriesFromGenerationLogs,
  getHistoryTitle,
  loadHistoryEntries,
  saveHistoryEntries,
  type HistoryEntry,
} from "../lib/history";
import { getPlatform } from "../lib/platforms";
import { saveGeneratedAsset } from "../lib/save-generated-asset";
import { saveGeneratedAssetsBatch } from "../lib/save-generated-assets-batch";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  emptyItem,
  isBusyStatus,
  queueGenerationItems,
  runAvatarStorefrontPosterFlow,
  runOneGeneration,
  syncImagesWithOss,
} from "../lib/workspace-session";
import type {
  AssetKind,
  AvatarReferenceMode,
  GenerationLine,
  GenerationItem,
  Platform,
  UploadedImage,
} from "../types";

export type WorkspaceTab =
  | "avatarStorefront"
  | "productImage"
  | "productBatch"
  | "pictureWall"
  | "pSignboard"
  | "history"
  | "admin";

interface WorkspaceOptions {
  userId: string;
}

export default function useGenerationWorkspace({ userId }: WorkspaceOptions) {
  const toast = useToast();
  const [tab, setTab] = useState<WorkspaceTab>("avatarStorefront");
  const [todayCount, setTodayCount] = useState(0);
  const [shopName, setShopName] = useState("");
  const [platform, setPlatform] = useState<Platform>("meituan");
  const [generationLine, setGenerationLine] = useState<GenerationLine>("line1");
  const [avatarMode, setAvatarMode] = useState<AvatarReferenceMode>("image");
  const [avatarCategory, setAvatarCategory] = useState("");
  const [productName, setProductName] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [avatar, setAvatar] = useState<GenerationItem>(emptyItem("avatar"));
  const [storefront, setStorefront] = useState<GenerationItem>(emptyItem("storefront"));
  const [poster, setPoster] = useState<GenerationItem>(emptyItem("poster"));
  const [product, setProduct] = useState<GenerationItem>(emptyItem("product"));
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);

  const startedAt = useRef<number | null>(null);
  const recordedGenerationLogs = useRef<Set<string>>(new Set());
  const currentPlatform = getPlatform(platform);

  useEffect(() => {
    saveHistoryEntries(historyEntries);
  }, [historyEntries]);

  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseConfigured) {
      setHistoryEntries(loadHistoryEntries());
      setTodayCount(0);
      return () => {
        cancelled = true;
      };
    }

    setHistoryEntries([]);
    setTodayCount(0);
    void (async () => {
      await cleanupExpiredGenerationLogs();
      const [count, logs] = await Promise.all([
        fetchTodayCount(userId),
        fetchGenerationLogs(userId),
      ]);
      if (cancelled) return;
      setTodayCount(count);
      setHistoryEntries(buildHistoryEntriesFromGenerationLogs(logs));
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (productName.trim()) return;
    const firstName = images[0]?.productName?.trim();
    if (firstName) setProductName(firstName);
  }, [images, productName]);

  const setters = { avatar: setAvatar, storefront: setStorefront, poster: setPoster, product: setProduct } as const;

  function pushHistoryEntry(kind: AssetKind, item: GenerationItem) {
    if (item.status !== "succeeded") return;

    const remoteUrl = item.remoteUrl;
    const previewUrl = item.rawDataUrl;
    if (!remoteUrl || !previewUrl) return;
    if (!markGenerationLogRecorded(recordedGenerationLogs.current, kind, remoteUrl)) return;
    const recordedLine = "generationLine" in item ? item.generationLine ?? null : generationLine;

    setHistoryEntries((prev) =>
      appendHistoryEntry(prev, {
        id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        title: getHistoryTitle(kind),
        shopName: shopName.trim() || "未命名店铺",
        remoteUrl,
        generationLine: recordedLine,
        previewUrl,
        createdAt: new Date().toISOString(),
      })
    );

    void recordGenerationLog({
      userId,
      shopName,
      assetKind: kind,
      platform,
      ossUrl: remoteUrl,
      generationLine: recordedLine,
    }).then(async () => {
      setTodayCount((n) => n + 1);
      await cleanupExpiredGenerationLogs();
    });
  }

  const productBatchWorkspace = useProductBatchWorkspace({
    shopName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast: toast.show,
    onRecordProductHistory: (item) => pushHistoryEntry("product", item),
  });
  const pictureWallWorkspace = usePictureWallWorkspace({
    shopName,
    generationLine,
    onToast: toast.show,
    onRecordPictureWallHistory: (item) => pushHistoryEntry("picture_wall", item),
  });
  const pSignboardWorkspace = usePSignboardWorkspace({
    shopName,
    generationLine,
    onToast: toast.show,
    onRecordPSignboardHistory: (item) => pushHistoryEntry("p_signboard", item),
  });

  useEffect(() => {
    if (tab !== "history" || !isSupabaseConfigured) return;
    let cancelled = false;
    void (async () => {
      const logs = await fetchGenerationLogs(userId);
      if (!cancelled) setHistoryEntries(buildHistoryEntriesFromGenerationLogs(logs));
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, userId]);

  const busy =
    [avatar, storefront, poster, product].some((item) => isBusyStatus(item.status)) ||
    productBatchWorkspace.busy ||
    pictureWallWorkspace.busy ||
    pSignboardWorkspace.busy;
  const canBatchDownload = canBatchDownloadAssets([avatar, storefront, poster]);

  useEffect(() => {
    if (!busy) {
      startedAt.current = null;
      setElapsed(0);
      return;
    }
    if (startedAt.current === null) startedAt.current = Date.now();
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 200);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    pushHistoryEntry("avatar", avatar);
  }, [avatar]);

  useEffect(() => {
    pushHistoryEntry("storefront", storefront);
  }, [storefront]);

  useEffect(() => {
    pushHistoryEntry("poster", poster);
  }, [poster]);

  useEffect(() => {
    pushHistoryEntry("product", product);
  }, [product]);

  async function syncImagesToOss() { return await syncImagesWithOss(images, setImages); }

  function validateProductInputs() {
    if (!shopName.trim()) {
      toast.show("请填写店铺名称", "error");
      return false;
    }
    if (!productName.trim()) {
      toast.show("请填写产品名称", "error");
      return false;
    }
    if (images.length === 0) {
      toast.show("请上传至少 1 张产品图", "error");
      return false;
    }
    return true;
  }

  function validateAvatarInputs() {
    const message = getAvatarGenerationErrorMessage({
      shopName,
      mode: avatarMode,
      category: avatarCategory,
      images,
    });
    if (!message) return true;
    toast.show(message, "error");
    return false;
  }

  async function handleGenerateAll() {
    if (!validateAvatarInputs()) return;

    let syncedImages = images;
    try {
      syncedImages = await syncImagesToOss();
    } catch (error: unknown) {
      toast.show(`上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }

    queueGenerationItems(getAvatarStorefrontPosterSequence(), setters);
    toast.show("先生成头像，再生成店招，最后生成海报，请耐心等待…", "info");
    await runAvatarStorefrontPosterFlow({
      sourceImages: syncedImages,
      setters,
      shopName,
      platform,
      currentPlatform,
      avatar,
      storefront,
      productName,
      avatarMode,
      avatarCategory,
      generationLine,
      onToast: toast.show,
    });
  }

  async function handleGenerateProduct() {
    if (!validateProductInputs()) return;

    let syncedImages: UploadedImage[];
    try {
      syncedImages = await syncImagesToOss();
    } catch (error: unknown) {
      toast.show(`上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }

    setProduct({ ...emptyItem("product"), status: "queued" });
    toast.show("正在根据产品图重新设计产品主图，请耐心等待…", "info");
    await runOneGeneration({
      kind: "product",
      sourceImages: syncedImages,
      setters,
      shopName,
      platform,
      currentPlatform,
      avatar,
      storefront,
      productName,
      avatarMode,
      avatarCategory,
      generationLine,
      onToast: toast.show,
    });
  }

  async function retryGeneration(kind: AssetKind) {
    let syncedImages = images;
    if (kind === "avatar" || kind === "product") {
      try {
        syncedImages = await syncImagesToOss();
      } catch (error: unknown) {
        toast.show(`上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`, "error");
        return null;
      }
    }

    return await runOneGeneration({
      kind,
      sourceImages: syncedImages,
      setters,
      shopName,
      productName,
      platform,
      currentPlatform,
      avatar,
      storefront,
      avatarMode,
      avatarCategory,
      generationLine,
      onToast: toast.show,
    });
  }

  async function handleDownload(kind: AssetKind) {
    const item =
      kind === "avatar"
        ? avatar
        : kind === "storefront"
          ? storefront
          : kind === "poster"
            ? poster
            : product;
    const extractedProductName = kind === "product"
      ? images[0]?.productName?.trim() || productName.trim()
      : undefined;

    try {
      const saved = await saveGeneratedAsset(
        kind,
        item,
        shopName,
        currentPlatform,
        extractedProductName
      );
      if (!saved) return;
      toast.show(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      toast.show(`保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function handleBatchDownload() {
    try {
      const saved = await saveGeneratedAssetsBatch({ avatar, storefront, poster }, shopName, currentPlatform);
      if (!saved || saved.length === 0) return;
      toast.show(`已批量保存 ${saved.length} 张图片`, "success");
    } catch (error: unknown) {
      toast.show(`批量保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  return {
    tab,
    setTab,
    shopName,
    setShopName,
    platform,
    setPlatform,
    generationLine,
    setGenerationLine,
    avatarMode,
    setAvatarMode,
    avatarCategory,
    setAvatarCategory,
    productName,
    setProductName,
    images,
    setImages,
    avatar,
    storefront,
    poster,
    product,
    productBatchImages: productBatchWorkspace.images,
    setProductBatchImages: productBatchWorkspace.setImages,
    productBatchStyleImages: productBatchWorkspace.styleImages,
    setProductBatchStyleImages: productBatchWorkspace.setStyleImages,
    productBatchEntries: productBatchWorkspace.entries,
    productBatchCompletedCount: productBatchWorkspace.completedCount,
    pictureWallImages: pictureWallWorkspace.images,
    setPictureWallImages: pictureWallWorkspace.setImages,
    pictureWallEntries: pictureWallWorkspace.entries,
    pictureWallCompletedCount: pictureWallWorkspace.completedCount,
    pictureWallDownloadStatus: pictureWallWorkspace.downloadStatus,
    pSignboardImages: pSignboardWorkspace.images,
    setPSignboardImages: pSignboardWorkspace.setImages,
    pSignboardOriginalText: pSignboardWorkspace.originalText,
    setPSignboardOriginalText: pSignboardWorkspace.setOriginalText,
    pSignboardNewText: pSignboardWorkspace.newText,
    setPSignboardNewText: pSignboardWorkspace.setNewText,
    pSignboardItem: pSignboardWorkspace.item,
    pSignboardBusy: pSignboardWorkspace.busy,
    historyEntries,
    elapsed,
    busy,
    todayCount,
    canBatchDownload,
    currentPlatform,
    handleGenerateAll,
    handleGenerateProduct,
    handleGenerateProductBatch: productBatchWorkspace.handleGenerate,
    handleGeneratePictureWall: pictureWallWorkspace.handleGenerate,
    retryPictureWallItem: pictureWallWorkspace.handleRetry,
    handleDownloadPictureWall: pictureWallWorkspace.handleDownload,
    handleGeneratePSignboard: pSignboardWorkspace.handleGenerate,
    resetPSignboard: pSignboardWorkspace.reset,
    handleDownload,
    handleDownloadProductBatchItem: productBatchWorkspace.download,
    handleBatchDownload,
    retryGeneration,
    retryProductBatchItem: productBatchWorkspace.retry,
  };
}
