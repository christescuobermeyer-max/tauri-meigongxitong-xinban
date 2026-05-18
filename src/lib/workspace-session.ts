import type { Dispatch, SetStateAction } from "react";
import { getAssetLabel } from "./generation-flow";
import { getAutoRetryAttempt, runWithAutoRetry } from "./generation-retry";
import { ensureUploadedImagesOnOss } from "./oss-assets";
import { archiveAssetToOss, generateAssetBase64 } from "./workspace-generation";
import type {
  AppearanceOptions,
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
  remoteUrl: string;
  generationLine: GenerationLine;
  elapsedMs: number;
  attempt?: number;
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
  appearance?: AppearanceOptions;
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
    appearance,
    onToast,
  } = options;
  const setter = getSetterByKind(kind, setters);

  let generated: Awaited<ReturnType<typeof generateAssetBase64>> & { attempt: number };
  try {
    generated = await runWithAutoRetry({
      onAttempt: (attempt) =>
        setter((prev) => ({ ...prev, status: "running", errorMessage: undefined, attempt })),
      run: () =>
        generateAssetBase64({
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
          appearance,
        }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const attempt = getAutoRetryAttempt(error);
    setter((prev) => ({
      ...prev,
      status: "failed",
      errorMessage: message,
      attempt: attempt ?? prev.attempt,
    }));
    onToast(`${getAssetLabel(kind)}生成失败：${message}`, "error");
    return null;
  }

  setter({
    kind,
    rawBase64: generated.rawBase64,
    rawDataUrl: generated.rawDataUrl,
    remoteUrl: "",
    generationLine: generated.generationLine,
    status: "succeeded",
    elapsedMs: generated.elapsedMs,
    attempt: generated.attempt,
  });

  try {
    const remoteUrl = await archiveAssetToOss(kind, shopName, generated.rawBase64);
    setter((prev) => ({ ...prev, remoteUrl }));
    return {
      rawBase64: generated.rawBase64,
      rawDataUrl: generated.rawDataUrl,
      remoteUrl,
      generationLine: generated.generationLine,
      elapsedMs: generated.elapsedMs,
      attempt: generated.attempt,
    };
  } catch (ossError: unknown) {
    const message = ossError instanceof Error ? ossError.message : String(ossError);
    onToast(`${getAssetLabel(kind)}已生成，但归档到云端失败：${message}`, "error");
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
