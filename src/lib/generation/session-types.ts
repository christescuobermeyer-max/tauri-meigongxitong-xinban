import type { Dispatch, SetStateAction } from "react";
import type { AppearanceOptions, AssetKind, AvatarReferenceMode, GenerationLine, GenerationItem, Platform, PlatformSpec, RemotePromptConfig, UploadedImage } from "../../types";

export interface RunOneResult {
  rawBase64: string;
  rawDataUrl: string;
  remoteUrl: string;
  generationLine: GenerationLine;
  elapsedMs: number;
  attempt?: number;
  historyRecorded?: boolean;
  historyError?: string;
  productName?: string;
}

export type GenerationSetter = Dispatch<SetStateAction<GenerationItem>>;

export interface GenerationSetters {
  avatar: GenerationSetter;
  storefront: GenerationSetter;
  poster: GenerationSetter;
  product: GenerationSetter;
}

export interface RunOneOptions {
  kind: AssetKind;
  sourceImages: UploadedImage[];
  referenceImages?: string[];
  promptOverride?: string;
  promptConfig?: RemotePromptConfig;
  setters: GenerationSetters;
  shopName: string;
  productName?: string;
  historyProductName?: string;
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

export interface SequenceOptions extends Omit<RunOneOptions, "kind" | "referenceImages"> {}
