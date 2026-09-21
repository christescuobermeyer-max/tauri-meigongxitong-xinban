import type { GenerationItem } from "../types";

export type ThreePieceAssetKind = "avatar" | "storefront" | "poster";
export type ThreePieceSelection = Record<ThreePieceAssetKind, boolean>;

export const THREE_PIECE_ORDER: readonly ThreePieceAssetKind[] = ["avatar", "storefront", "poster"];

export const THREE_PIECE_LABEL: Record<ThreePieceAssetKind, string> = {
  avatar: "头像",
  storefront: "店招",
  poster: "海报",
};

export const DEFAULT_THREE_PIECE_SELECTION: ThreePieceSelection = {
  avatar: true,
  storefront: true,
  poster: true,
};

export const SKIPPED_THREE_PIECE_MESSAGE = "本次未选择生成";

export function getSelectedThreePieceKinds(selection: ThreePieceSelection): ThreePieceAssetKind[] {
  return THREE_PIECE_ORDER.filter((kind) => selection[kind]);
}

export function toggleThreePieceSelection(
  selection: ThreePieceSelection,
  kind: ThreePieceAssetKind
): ThreePieceSelection {
  if (selection[kind] && getSelectedThreePieceKinds(selection).length <= 1) return selection;
  return { ...selection, [kind]: !selection[kind] };
}

export function formatThreePieceKindList(kinds: readonly ThreePieceAssetKind[]): string {
  const labels = kinds.map((kind) => THREE_PIECE_LABEL[kind]);
  if (labels.length === 0) return "生成项目";
  if (labels.length <= 2) return labels.join("、");
  return `${labels.slice(0, -1).join("、")}与${labels[labels.length - 1]}`;
}

export function formatThreePieceSelection(selection: ThreePieceSelection): string {
  return formatThreePieceKindList(getSelectedThreePieceKinds(selection));
}

export function canBatchDownloadThreePieceSelection(
  items: Record<ThreePieceAssetKind, GenerationItem>,
  selection: ThreePieceSelection
) {
  const selectedKinds = getSelectedThreePieceKinds(selection);
  return (
    selectedKinds.length > 0 &&
    selectedKinds.every((kind) => items[kind].status === "succeeded" && Boolean(items[kind].rawBase64))
  );
}
