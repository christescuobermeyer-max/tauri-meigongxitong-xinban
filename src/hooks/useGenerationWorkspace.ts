import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import useDetailPageWorkspace from "./useDetailPageWorkspace";
import useImageEditWorkspace from "./useImageEditWorkspace";
import usePSignboardWorkspace from "./usePSignboardWorkspace";
import usePictureWallWorkspace from "./usePictureWallWorkspace";
import useProductBatchWorkspace from "./useProductBatchWorkspace";
import { getAvatarGenerationErrorMessage } from "../lib/avatar-generation";
import {
  cleanupExpiredGenerationLogs,
  fetchGenerationLogsPage,
  fetchTodayCount,
  recordGenerationLog,
} from "../lib/cloud-history";
import { canBatchDownloadAssets } from "../lib/generated-asset-files";
import { HISTORY_PAGE_SIZE } from "../lib/history-pagination";
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
  | "imageEdit"
  | "detailPage"
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
  const [productPlatform, setProductPlatform] = useState<Platform | null>(null);
  const [productBatchPlatform, setProductBatchPlatform] = useState<Platform | null>(null);
  const [imageEditPlatform, setImageEditPlatform] = useState<Platform | null>(null);
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
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const startedAt = useRef<number | null>(null);
  const recordedGenerationLogs = useRef<Set<string>>(new Set());
  const productCurrentPlatform = productPlatform ? getPlatform(productPlatform) : null;
  const productBatchCurrentPlatform = productBatchPlatform ? getPlatform(productBatchPlatform) : null;
  const imageEditCurrentPlatform = imageEditPlatform ? getPlatform(imageEditPlatform) : null;
  const threePiecePlatform = getPlatform("meituan");

  useEffect(() => {
    if (isSupabaseConfigured) return;
    saveHistoryEntries(historyEntries);
  }, [historyEntries]);

  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseConfigured) {
      const localEntries = loadHistoryEntries();
      setHistoryEntries(localEntries);
      setHistoryTotalCount(localEntries.length);
      setHistoryPage(1);
      setTodayCount(0);
      return () => {
        cancelled = true;
      };
    }

    setHistoryEntries([]);
    setHistoryPage(1);
    setHistoryTotalCount(0);
    setTodayCount(0);
    setHistoryLoading(true);
    void (async () => {
      await cleanupExpiredGenerationLogs();
      const [count, pageResult] = await Promise.all([
        fetchTodayCount(userId),
        fetchGenerationLogsPage(userId, 1, HISTORY_PAGE_SIZE),
      ]);
      if (cancelled) return;
      setTodayCount(count);
      setHistoryPage(pageResult.page);
      setHistoryTotalCount(pageResult.totalCount);
      setHistoryEntries(buildHistoryEntriesFromGenerationLogs(pageResult.logs));
      setHistoryLoading(false);
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

  function pushHistoryEntry(kind: AssetKind, item: GenerationItem, recordPlatform?: Platform) {
    if (item.status !== "succeeded") return;

    const remoteUrl = item.remoteUrl;
    const previewUrl = remoteUrl;
    if (!remoteUrl || !previewUrl) return;
    if (!markGenerationLogRecorded(recordedGenerationLogs.current, kind, remoteUrl)) return;
    const recordedLine = "generationLine" in item ? item.generationLine ?? null : generationLine;
    const platformForRecord = recordPlatform ?? "meituan";

    const localEntry = {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      title: getHistoryTitle(kind),
      shopName: shopName.trim() || "未命名店铺",
      remoteUrl,
      generationLine: recordedLine,
      previewUrl,
      createdAt: new Date().toISOString(),
    };

    if (!isSupabaseConfigured) {
      setHistoryEntries((prev) => appendHistoryEntry(prev, localEntry));
      setHistoryTotalCount((count) => count + 1);
      return;
    }

    void recordGenerationLog({
      userId,
      shopName,
      assetKind: kind,
      platform: platformForRecord,
      ossUrl: remoteUrl,
      generationLine: recordedLine,
    }).then(async (recorded) => {
      if (!recorded) {
        toast.show("云端生图记录写入失败，请刷新历史记录或联系管理员检查数据库配置", "error");
        return;
      }
      setTodayCount((n) => n + 1);
      if (isSupabaseConfigured) {
        setHistoryTotalCount((count) => count + 1);
        if (tab === "history") await refreshCloudHistoryPage(historyPage);
      }
      await cleanupExpiredGenerationLogs();
    });
  }

  const productBatchWorkspace = useProductBatchWorkspace({
    shopName,
    platform: productBatchPlatform,
    currentPlatform: productBatchCurrentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast: toast.show,
    onRecordProductHistory: (item) => pushHistoryEntry("product", item, productBatchPlatform ?? undefined),
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
  const imageEditWorkspace = useImageEditWorkspace({
    shopName,
    platform: imageEditPlatform,
    currentPlatform: imageEditCurrentPlatform,
    generationLine,
    onToast: toast.show,
    onRecordHistory: (kind, item) => pushHistoryEntry(kind, item, imageEditPlatform ?? undefined),
  });
  const detailPageWorkspace = useDetailPageWorkspace({
    shopName,
    generationLine,
    onToast: toast.show,
    onRecordDetailPageHistory: (item) => pushHistoryEntry("detail_page", item),
  });

  useEffect(() => {
    if (tab !== "history" || !isSupabaseConfigured) return;
    let cancelled = false;
    void (async () => {
      setHistoryLoading(true);
      const pageResult = await fetchGenerationLogsPage(userId, historyPage, HISTORY_PAGE_SIZE);
      if (!cancelled) {
        setHistoryPage(pageResult.page);
        setHistoryTotalCount(pageResult.totalCount);
        setHistoryEntries(buildHistoryEntriesFromGenerationLogs(pageResult.logs));
        setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, userId, historyPage]);

  async function refreshCloudHistoryPage(page: number) {
    if (!isSupabaseConfigured) return;
    setHistoryLoading(true);
    const pageResult = await fetchGenerationLogsPage(userId, page, HISTORY_PAGE_SIZE);
    setHistoryPage(pageResult.page);
    setHistoryTotalCount(pageResult.totalCount);
    setHistoryEntries(buildHistoryEntriesFromGenerationLogs(pageResult.logs));
    setHistoryLoading(false);
  }

  const busy =
    [avatar, storefront, poster, product].some((item) => isBusyStatus(item.status)) ||
    productBatchWorkspace.busy ||
    pictureWallWorkspace.busy ||
    pSignboardWorkspace.busy ||
    imageEditWorkspace.busy ||
    detailPageWorkspace.busy;
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
    pushHistoryEntry("avatar", avatar, "meituan");
  }, [avatar]);

  useEffect(() => {
    pushHistoryEntry("storefront", storefront, "meituan");
  }, [storefront]);

  useEffect(() => {
    pushHistoryEntry("poster", poster, "meituan");
  }, [poster]);

  useEffect(() => {
    pushHistoryEntry("product", product, productPlatform ?? undefined);
  }, [product]);

  async function syncImagesToOss() { return await syncImagesWithOss(images, setImages); }

  function validateProductInputs() {
    if (!shopName.trim()) {
      toast.show("请填写店铺名称", "error");
      return false;
    }
    if (!productPlatform || !productCurrentPlatform) {
      toast.show("请先选择投放平台：美团或淘宝闪购", "error");
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
      platform: "meituan",
      currentPlatform: threePiecePlatform,
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
    if (!productPlatform || !productCurrentPlatform) return;

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
      platform: productPlatform,
      currentPlatform: productCurrentPlatform,
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
    const generationPlatform = kind === "product" ? productPlatform : "meituan";
    const generationPlatformSpec = kind === "product" ? productCurrentPlatform : threePiecePlatform;
    if (!generationPlatform || !generationPlatformSpec) {
      toast.show("请先选择投放平台：美团或淘宝闪购", "error");
      return null;
    }
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
      platform: generationPlatform,
      currentPlatform: generationPlatformSpec,
      avatar,
      storefront,
      avatarMode,
      avatarCategory,
      generationLine,
      onToast: toast.show,
    });
  }

  async function handleDownload(kind: AssetKind, targetPlatform?: Platform) {
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
    const downloadPlatform = targetPlatform
      ? getPlatform(targetPlatform)
      : kind === "product"
        ? productCurrentPlatform
        : threePiecePlatform;
    if (!downloadPlatform) {
      toast.show("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }

    try {
      const saved = await saveGeneratedAsset(
        kind,
        item,
        shopName,
        downloadPlatform,
        extractedProductName
      );
      if (!saved) return;
      toast.show(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      toast.show(`保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function handleBatchDownload(targetPlatform: Platform) {
    try {
      const saved = await saveGeneratedAssetsBatch(
        { avatar, storefront, poster },
        shopName,
        getPlatform(targetPlatform)
      );
      if (!saved || saved.length === 0) return;
      const platformLabel = getPlatform(targetPlatform).label;
      toast.show(`已批量保存 ${saved.length} 张${platformLabel}尺寸图片`, "success");
    } catch (error: unknown) {
      toast.show(`批量保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function handleDownloadPSignboard() {
    try {
      const saved = await saveGeneratedAsset("p_signboard", pSignboardWorkspace.item, shopName, threePiecePlatform);
      if (!saved) return;
      toast.show(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      toast.show(`保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  return {
    tab,
    setTab,
    shopName,
    setShopName,
    productPlatform,
    setProductPlatform,
    productBatchPlatform,
    setProductBatchPlatform,
    imageEditPlatform,
    setImageEditPlatform,
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
    imageEditEntries: imageEditWorkspace.entries,
    imageEditBusy: imageEditWorkspace.busy,
    setImageEditImages: imageEditWorkspace.setImages,
    setImageEditInstruction: imageEditWorkspace.setInstruction,
    detailPageImages: detailPageWorkspace.images,
    setDetailPageImages: detailPageWorkspace.setImages,
    detailPageEntries: detailPageWorkspace.entries,
    detailPageCompletedCount: detailPageWorkspace.completedCount,
    detailPageBusy: detailPageWorkspace.busy,
    historyEntries,
    historyPage,
    historyTotalCount,
    historyLoading,
    historyUsesCloud: isSupabaseConfigured,
    setHistoryPage,
    elapsed,
    busy,
    todayCount,
    canBatchDownload,
    productCurrentPlatform,
    productBatchCurrentPlatform,
    imageEditCurrentPlatform,
    handleGenerateAll,
    handleGenerateProduct,
    handleGenerateProductBatch: productBatchWorkspace.handleGenerate,
    handleGeneratePictureWall: pictureWallWorkspace.handleGenerate,
    retryPictureWallItem: pictureWallWorkspace.handleRetry,
    handleDownloadPictureWall: pictureWallWorkspace.handleDownload,
    handleGeneratePSignboard: pSignboardWorkspace.handleGenerate,
    handleDownloadPSignboard,
    handleGenerateImageEdit: imageEditWorkspace.generate,
    handleDownloadImageEdit: imageEditWorkspace.download,
    handleGenerateDetailPage: detailPageWorkspace.handleGenerate,
    retryDetailPageItem: detailPageWorkspace.handleRetry,
    handleDownloadDetailPage: detailPageWorkspace.handleDownload,
    handleDownloadDetailPageItem: detailPageWorkspace.handleDownloadItem,
    resetPSignboard: pSignboardWorkspace.reset,
    handleDownload,
    handleDownloadProductBatchItem: productBatchWorkspace.download,
    handleDownloadProductBatchAll: productBatchWorkspace.downloadAll,
    handleBatchDownload,
    retryGeneration,
    retryProductBatchItem: productBatchWorkspace.retry,
  };
}

export type GenerationWorkspace = ReturnType<typeof useGenerationWorkspace>;
