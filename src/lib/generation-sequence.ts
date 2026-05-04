import type { AssetKind } from "../types";

const AVATAR_STOREFRONT_POSTER_SEQUENCE: AssetKind[] = ["avatar", "storefront", "poster"];

export function getAvatarStorefrontPosterSequence(): AssetKind[] {
  return [...AVATAR_STOREFRONT_POSTER_SEQUENCE];
}
