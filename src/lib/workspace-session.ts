import type { Dispatch, SetStateAction } from "react";
import { getAssetLabel } from "./generation-flow";
import { ensureUploadedImagesOnOss } from "./oss-assets";
import { generateAsset } from "./workspace-generation";
import type {
  AssetKind,
  AvatarReferenceMode,
  GenerationLine,
  GenerationItem,
  Platform,
  PlatformSpec,
  UploadedImage,
} from "../types";

export interface RunOneResult {
  rawBase64: string;
  rawDataUrl: string;
  remoteUrl?: string;
  generationLine: GenerationLine;
  elapsedMs: number;
}

type GenerationSetter = Dispatch<SetStateAction<GenerationItem>>;

interface GenerationSetters {
  avatar: GenerationSetter;
  storefront: GenerationSetter;
  poster: GenerationSetter;
  product: GenerationSetter;
}

interface RunOneOptions {
  kind: AssetKind;
  sourceImages: UploadedImage[];
  referenceImages?: string[];
  promptOverride?: string;
  setters: GenerationSetters;
  shopName: string;
  productName?: string;
  platform: Platform;
  currentPlatform: PlatformSpec;
  avatar: GenerationItem;
  storefront: GenerationItem;
  avatarMode: AvatarReferenceMode;
  avatarCategory: string;
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
}

interface SequenceOptions extends Omit<RunOneOptions, "kind" | "referenceImages"> {}

export function emptyItem(kind: AssetKind): GenerationItem {
  return {
    kind,
    rawBase64: null,
    rawDataUrl: null,
    status: "idle",
  };
}

export function isBusyStatus(status: GenerationItem["status"]) {
  return status === "running" || status === "queued";
}

export function getSetterByKind(kind: AssetKind, setters: GenerationSetters) {
  return kind === "avatar"
    ? setters.avatar
    : kind === "storefront"
      ? setters.storefront
      : kind === "poster"
        ? setters.poster
        : setters.product;
}

export async function syncImagesWithOss(
  images: UploadedImage[],
  setImages: (next: UploadedImage[]) => void
) {
  const synced = await ensureUploadedImagesOnOss(images);
  if (synced !== images) setImages(synced);
  return synced;
}

export async function runOneGeneration(options: RunOneOptions): Promise<RunOneResult | null> {
  const {
    kind,
    sourceImages,
    referenceImages,
    promptOverride,
    setters,
    shopName,
    productName = "",
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast,
  } = options;
  const setter = getSetterByKind(kind, setters);
  setter((prev) => ({ ...prev, status: "running", errorMessage: undefined }));

  try {
    const generated = await generateAsset({
      kind,
      shopName,
      productName,
      platform,
      currentPlatform,
      sourceImages,
      avatar,
      storefront,
      referenceImages,
      promptOverride,
      avatarMode,
      avatarCategory,
      generationLine,
    });
    if (generated.archiveErrorMessage) onToast(generated.archiveErrorMessage, "error");
    setter({
      kind,
      rawBase64: generated.rawBase64,
      rawDataUrl: generated.rawDataUrl,
      remoteUrl: generated.remoteUrl,
      generationLine: generated.generationLine,
      status: "succeeded",
      elapsedMs: generated.elapsedMs,
    });
    return {
      rawBase64: generated.rawBase64,
      rawDataUrl: generated.rawDataUrl,
      remoteUrl: generated.remoteUrl,
      generationLine: generated.generationLine,
      elapsedMs: generated.elapsedMs,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setter((prev) => ({
      ...prev,
      status: "failed",
      errorMessage: message,
    }));
    onToast(`${getAssetLabel(kind)}生成失败：${message}`, "error");
    return null;
  }
}

export function markFailedItem(
  kind: AssetKind,
  message: string,
  setters: GenerationSetters
) {
  getSetterByKind(kind, setters)((prev) => ({
    ...prev,
    status: "failed",
    errorMessage: message,
  }));
}

export function queueGenerationItems(kinds: AssetKind[], setters: GenerationSetters) {
  for (const kind of kinds) {
    getSetterByKind(kind, setters)({ ...emptyItem(kind), status: "queued" });
  }
}

export async function runAvatarStorefrontPosterFlow(
  options: SequenceOptions
): Promise<void> {
  const {
    sourceImages,
    setters,
    shopName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast,
  } = options;

  const avatarResult = await runOneGeneration({
    kind: "avatar",
    sourceImages,
    setters,
    shopName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast,
  });
  if (!avatarResult) {
    markFailedItem("storefront", "头像生成失败，店招未生成", setters);
    markFailedItem("poster", "头像生成失败，海报未生成", setters);
    return;
  }

  const storefrontResult = await runOneGeneration({
    kind: "storefront",
    sourceImages,
    referenceImages: avatarResult.remoteUrl ? [avatarResult.remoteUrl] : [avatarResult.rawBase64],
    setters,
    shopName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast,
  });
  if (!storefrontResult) {
    markFailedItem("poster", "店招生成失败，海报未生成", setters);
    return;
  }

  await runOneGeneration({
    kind: "poster",
    sourceImages,
    referenceImages: avatarResult.remoteUrl ? [avatarResult.remoteUrl] : [avatarResult.rawBase64],
    setters,
    shopName,
    platform,
    currentPlatform,
    avatar,
    storefront,
    avatarMode,
    avatarCategory,
    generationLine,
    onToast,
  });
}
