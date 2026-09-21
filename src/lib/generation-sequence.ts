import {
  getSelectedThreePieceKinds,
  THREE_PIECE_ORDER,
  type ThreePieceAssetKind,
  type ThreePieceSelection,
} from "./three-piece-selection";

export function getAvatarStorefrontPosterSequence(): ThreePieceAssetKind[] {
  return [...THREE_PIECE_ORDER];
}

export function getSelectedAvatarStorefrontPosterSequence(
  selection: ThreePieceSelection
): ThreePieceAssetKind[] {
  return getSelectedThreePieceKinds(selection);
}
