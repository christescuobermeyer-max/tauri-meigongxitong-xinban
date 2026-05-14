import { useState, type Dispatch, type SetStateAction } from "react";
import { getAvatarGenerationErrorMessage } from "../lib/avatar-generation";
import { canBatchDownloadAssets } from "../lib/generated-asset-files";
import { getAvatarStorefrontPosterSequence } from "../lib/generation-sequence";
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
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (
    kind: AssetKind,
    item: GenerationItem,
    shopName: string,
    platform: Platform
  ) => void;
}

export default function useThreePieceWorkspace(options: Options) {
  const { generationLine, onToast, onRecordHistory } = options;
  const [shopName, setShopName] = useState("");
  const [avatarMode, setAvatarMode] = useState<AvatarReferenceMode>("image");
  const [avatarCategory, setAvatarCategory] = useState("");
  const [themeColor, setThemeColor] = useState<ThemeColor | "">("");
  const [brandStyle, setBrandStyle] = useState<BrandStyle | "">("");
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

  const busy = [avatar, storefront, poster].some((item) => isBusyStatus(item.status));
  const canBatchDownload = canBatchDownloadAssets([avatar, storefront, poster]);

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
    };
    onRecordHistory(kind, item, shopNameSnapshot, THREE_PIECE_PLATFORM);
  }

  async function handleGenerate() {
    if (!validateAvatarInputs()) return;

    const snapshot = {
      shopName: shopName.trim(),
      avatarMode,
      avatarCategory,
      generationLine,
      themeColor,
      brandStyle,
    };

    let syncedImages: UploadedImage[];
    try {
      syncedImages = await syncImagesToOss();
    } catch (error: unknown) {
      onToast(
        `上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      return;
    }

    queueGenerationItems(getAvatarStorefrontPosterSequence(), setters);
    onToast("先生成头像，再生成店招，最后生成海报，请耐心等待…", "info");

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

    const avatarResult = await runOneGeneration({ ...baseOptions, kind: "avatar" });
    if (!avatarResult) {
      markFailedItem("storefront", "头像生成失败，店招未生成", setters);
      markFailedItem("poster", "头像生成失败，海报未生成", setters);
      return;
    }
    recordResult("avatar", avatarResult, snapshot.shopName);

    const storefrontResult = await runOneGeneration({ ...baseOptions, kind: "storefront" });
    if (!storefrontResult) {
      markFailedItem("poster", "店招生成失败，海报未生成", setters);
      return;
    }
    recordResult("storefront", storefrontResult, snapshot.shopName);

    const posterResult = await runOneGeneration({ ...baseOptions, kind: "poster" });
    if (posterResult) recordResult("poster", posterResult, snapshot.shopName);
  }

  async function retry(kind: "avatar" | "storefront" | "poster") {
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
    kind: "avatar" | "storefront" | "poster",
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
    try {
      const saved = await saveGeneratedAssetsBatch(
        { avatar, storefront, poster },
        shopName,
        getPlatform(targetPlatform)
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

  return {
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
