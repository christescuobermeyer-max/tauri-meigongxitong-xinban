import type { PlatformSpec } from "../../types";
import type { ImageEditKind } from "./types";
import { PICTURE_WALL_EXPORT_SIZE, PICTURE_WALL_SOURCE_SIZE } from "../picture-wall";

export function getImageEditSpec(kind: ImageEditKind, platform: PlatformSpec) {
  if (kind === "avatar") {
    return {
      sourceLabel: "原图 1024×1024",
      exportLabel: `${platform.avatar.w}×${platform.avatar.h}`,
      uploadTitle: "上传 1 张头像图",
    };
  }

  if (kind === "storefront") {
    return {
      sourceLabel: "原图 1792×1024",
      exportLabel: `${platform.storefront.w}×${platform.storefront.h}`,
      uploadTitle: "上传 1 张店招图",
    };
  }

  if (kind === "poster") {
    return {
      sourceLabel: `原图 ${platform.poster.sourceLabel} 横版`,
      exportLabel: `${platform.poster.export.w}×${platform.poster.export.h}`,
      uploadTitle: "上传 1 张海报图",
    };
  }

  if (kind === "picture_wall") {
    return {
      sourceLabel: "原图 1024×1536（2:3 竖版）",
      exportLabel: `${PICTURE_WALL_SOURCE_SIZE.w}×${PICTURE_WALL_SOURCE_SIZE.h} + ${PICTURE_WALL_EXPORT_SIZE.w}×${PICTURE_WALL_EXPORT_SIZE.h}`,
      uploadTitle: "上传 1 张图片墙图",
    };
  }

  return {
    sourceLabel: `原图 ${platform.product.source.w}×${platform.product.source.h}`,
    exportLabel: `${platform.product.export.w}×${platform.product.export.h}`,
    uploadTitle: "上传 1-4 张产品图",
  };
}
