import type { ImageEditKind, ImageEditBatchEntry } from "../../lib/image-edit/types";
import type { AssetKind, GenerationItem, GenerationLine, Platform, UploadedImage } from "../../types";

export interface Entry {
  images: UploadedImage[];
  referenceImages: UploadedImage[];
  instruction: string;
  item: GenerationItem;
  batchEntries: ImageEditBatchEntry[];
}

export type Entries = Record<ImageEditKind, Entry>;

export interface Options {
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (
    kind: AssetKind,
    item: GenerationItem,
    shopName: string,
    platform: Platform
  ) => void;
}
