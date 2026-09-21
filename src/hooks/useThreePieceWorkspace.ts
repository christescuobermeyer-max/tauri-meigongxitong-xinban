import { useState, type Dispatch, type SetStateAction } from "react";
import { getAvatarGenerationErrorMessage } from "../lib/avatar-generation";
import {
  getAvatarStorefrontPosterSequence,
  getSelectedAvatarStorefrontPosterSequence,
} from "../lib/generation-sequence";
import {
  DEFAULT_THREE_PIECE_SELECTION,
  THREE_PIECE_LABEL,
  canBatchDownloadThreePieceSelection,
  formatThreePieceKindList,
  toggleThreePieceSelection,
  type ThreePieceAssetKind,
  type ThreePieceSelection,
} from "../lib/three-piece-selection";
import { getPlatform } from "../lib/platforms";
import { saveGeneratedAsset } from "../lib/save-generated-asset";
import { saveGeneratedAssetsBatch } from "../lib/save-generated-assets-batch";
import {
  emptyItem,
  isBusyStatus,
  markFailedItem,
  queueGenerationItems,
  runOneGeneration,
  syncImagesWithOss,
  type RunOneResult,
} from "../lib/workspace-session";
import type {
  AssetKind,
  AvatarReferenceMode,
  BrandStyle,
  GenerationItem,
  GenerationLine,
  Platform,
  ThemeColor,
  UploadedImage,
} from "../types";

const THREE_PIECE_PLATFORM: Platform = "meituan";

const noopSetter: Dispatch<SetStateAction<GenerationItem>> = () => undefined;

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

export default function useThreePieceWorkspace(options: Options) {
  const { generationLine, setGenerationLine, onToast, onRecordHistory } = options;
  const [shopName, setShopName] = useState("");
  const [avatarMode, setAvatarMode] = useState<AvatarReferenceMode>("image");
  const [avatarCategory, setAvatarCategory] = useState("");
  const [themeColor, setThemeColor] = useState<ThemeColor | "">("");
  const [brandStyle, setBrandStyle] = useState<BrandStyle | "">("");
  const [selectedKinds, setSelectedKinds] = useState<ThreePieceSelection>(DEFAULT_THREE_PIECE_SELECTION);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [avatar, setAvatar] = useState<GenerationItem>(emptyItem("avatar"));
  const [storefront, setStorefront] = useState<GenerationItem>(emptyItem("storefront"));
  const [poster, setPoster] = useState<GenerationItem>(emptyItem("poster"));

  const platformSpec = getPlatform(THREE_PIECE_PLATFORM);
  const setters = {
    avatar: setAvatar,
    storefront: setStorefront,
    poster: setPoster,
    product: noopSetter,
  } as const;

  const selectedAssetKinds = getSelectedAvatarStorefrontPosterSequence(selectedKinds);
  const currentItems = { avatar, storefront, poster };
  const busy = [avatar, storefront, poster].some((item) => isBusyStatus(item.status));
  const canBatchDownload = canBatchDownloadThreePieceSelection(currentItems, selectedKinds);

  function toggleSelectedKind(kind: ThreePieceAssetKind) {
    if (busy) return;
    setSelectedKinds((current) => toggleThreePieceSelection(current, kind));
  }

  function validateAvatarInputs() {
    const message = getAvatarGenerationErrorMessage({
      shopName,
      mode: avatarMode,
      category: avatarCategory,
      images,
    });
    if (!message) return true;
    onToast(message, "error");
    return false;
  }

  async function syncImagesToOss() {
    return await syncImagesWithOss(images, setImages);
  }

  function recordResult(kind: AssetKind, result: RunOneResult, shopNameSnapshot: string) {
    const item: GenerationItem = {
      kind,
      rawBase64: result.rawBase64,
      rawDataUrl: result.rawDataUrl,
      remoteUrl: result.remoteUrl,
      generationLine: result.generationLine,
      status: "succeeded",
      elapsedMs: result.elapsedMs,
      attempt: result.attempt,
      historyRecorded: result.historyRecorded,
      historyError: result.historyError,
    };
    onRecordHistory(kind, item, shopNameSnapshot, THREE_PIECE_PLATFORM);
  }

  async function handleGenerate() {
    const selectedAssetKinds = getSelectedAvatarStorefrontPosterSequence(selectedKinds);
    if (selectedAssetKinds.length === 0) {
      onToast("请至少选择 1 个生成项目", "error");
      return;
    }
    if (!validateAvatarInputs()) return;

    const snapshot = {
      shopName: shopName.trim(),
      avatarMode,
      avatarCategory,
      generationLine,
      themeColor,
      brandStyle,
      selectedAssetKinds,
    };

    queueGenerationItems(selectedAssetKinds, setters);
    clearUnselectedItems(snapshot.selectedAssetKinds);
    onToast(`正在上传参考图到 OSS，随后会生成${formatThreePieceKindList(snapshot.selectedAssetKinds)}…`, "info");

    let syncedImages: UploadedImage[];
    try {
      syncedImages = await syncImagesToOss();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      for (const kind of snapshot.selectedAssetKinds) {
        markFailedItem(kind, `参考图上传失败：${message}`, setters);
      }
      onToast(
        `上传参考图到 OSS 失败：${message}`,
        "error"
      );
      return;
    }

    onToast(`正在按顺序生成${formatThreePieceKindList(snapshot.selectedAssetKinds)}，请耐心等待…`, "info");

    const baseOptions = {
      sourceImages: syncedImages,
      setters,
      shopName: snapshot.shopName,
      platform: THREE_PIECE_PLATFORM,
      currentPlatform: platformSpec,
      avatar,
      storefront,
      avatarMode: snapshot.avatarMode,
      avatarCategory: snapshot.avatarCategory,
      generationLine: snapshot.generationLine,
      appearance: {
        themeColor: snapshot.themeColor || undefined,
        brandStyle: snapshot.brandStyle || undefined,
      },
      onToast,
    } as const;

    for (const [index, kind] of snapshot.selectedAssetKinds.entries()) {
      const result = await runOneGeneration({ ...baseOptions, kind });
      if (!result) {
        for (const pendingKind of snapshot.selectedAssetKinds.slice(index + 1)) {
          markFailedItem(
            pendingKind,
            `${THREE_PIECE_LABEL[kind]}生成失败，${THREE_PIECE_LABEL[pendingKind]}未生成`,
            setters
          );
        }
        return;
      }
      recordResult(kind, result, snapshot.shopName);
    }
  }

  async function retry(kind: ThreePieceAssetKind) {
    if (!selectedKinds[kind]) {
      onToast(`请先勾选${THREE_PIECE_LABEL[kind]}再重新生成`, "info");
      return null;
    }
    if (!validateAvatarInputs()) return null;

    const snapshot = {
      shopName: shopName.trim(),
      avatarMode,
      avatarCategory,
      generationLine,
      themeColor,
      brandStyle,
    };

    let syncedImages = images;
    if (kind === "avatar") {
      try {
        syncedImages = await syncImagesToOss();
      } catch (error: unknown) {
        onToast(
          `上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`,
          "error"
        );
        return null;
      }
    }

    const result = await runOneGeneration({
      kind,
      sourceImages: syncedImages,
      setters,
      shopName: snapshot.shopName,
      platform: THREE_PIECE_PLATFORM,
      currentPlatform: platformSpec,
      avatar,
      storefront,
      avatarMode: snapshot.avatarMode,
      avatarCategory: snapshot.avatarCategory,
      generationLine: snapshot.generationLine,
      appearance: {
        themeColor: snapshot.themeColor || undefined,
        brandStyle: snapshot.brandStyle || undefined,
      },
      onToast,
    });

    if (result) recordResult(kind, result, snapshot.shopName);
    return result;
  }

  async function handleDownload(
    kind: ThreePieceAssetKind,
    targetPlatform?: Platform
  ) {
    const item = kind === "avatar" ? avatar : kind === "storefront" ? storefront : poster;
    const downloadPlatform = targetPlatform ? getPlatform(targetPlatform) : platformSpec;
    try {
      const saved = await saveGeneratedAsset(kind, item, shopName, downloadPlatform);
      if (!saved) return;
      onToast(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      onToast(
        `保存失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  async function handleBatchDownload(targetPlatform: Platform) {
    const selectedAssetKinds = getSelectedAvatarStorefrontPosterSequence(selectedKinds);
    try {
      const saved = await saveGeneratedAssetsBatch(
        { avatar, storefront, poster },
        shopName,
        getPlatform(targetPlatform),
        selectedAssetKinds
      );
      if (!saved || saved.length === 0) return;
      const platformLabel = getPlatform(targetPlatform).label;
      onToast(`已批量保存 ${saved.length} 张${platformLabel}尺寸图片`, "success");
    } catch (error: unknown) {
      onToast(
        `批量保存失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    }
  }

  function clearUnselectedItems(selected: readonly ThreePieceAssetKind[]) {
    const selectedSet = new Set(selected);
    for (const kind of getAvatarStorefrontPosterSequence()) {
      if (!selectedSet.has(kind)) setters[kind](emptyItem(kind));
    }
  }

  return {
    generationLine,
    setGenerationLine,
    shopName,
    setShopName,
    avatarMode,
    setAvatarMode,
    avatarCategory,
    setAvatarCategory,
    themeColor,
    setThemeColor,
    brandStyle,
    setBrandStyle,
    selectedKinds,
    selectedAssetKinds,
    toggleSelectedKind,
    images,
    setImages,
    avatar,
    storefront,
    poster,
    busy,
    canBatchDownload,
    handleGenerate,
    retry,
    handleDownload,
    handleBatchDownload,
  };
}
