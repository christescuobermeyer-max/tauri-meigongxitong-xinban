import type { AssetKind, GenerationLine, GenerationItem, Platform } from "../../types";

export interface Options {
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

export type ProductBatchProductNameMode = "with" | "without";
export type ProductBatchReferenceBowlMode = "match" | "free";
