import type { AssetKind, GenerationItem } from "../../types";

export type ImageEditKind = Extract<
  AssetKind,
  "avatar" | "storefront" | "poster" | "product" | "picture_wall"
>;

export const IMAGE_EDIT_KINDS: ImageEditKind[] = [
  "avatar",
  "storefront",
  "poster",
  "product",
  "picture_wall",
];

export type ImageEditMode = "single" | "batch";

export const IMAGE_EDIT_BATCH_MAX_IMAGES = 20;

export const IMAGE_EDIT_LABEL: Record<ImageEditKind, string> = {
  avatar: "头像",
  storefront: "店招",
  poster: "海报",
  product: "产品图",
  picture_wall: "图片墙",
};

export interface ImageEditBatchEntry {
  sourceImageId: string;
  sourceName: string;
  productName: string;
  previewUrl: string;
  item: GenerationItem;
}

export type ImageEditBatchEntryUpdate =
  | GenerationItem
  | ((previous: GenerationItem) => GenerationItem);
