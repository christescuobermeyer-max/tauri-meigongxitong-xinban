import { DETAIL_PAGE_EXPORT_SIZE } from "./detail-page";
import { DATA_ANALYSIS_EXPORT_SIZE } from "./data-analysis";
import { PATROL_SCRIPT_EXPORT_SIZE } from "./patrol-script";
import { BRAND_STORY_IMAGE_CONFIGS, BRAND_STORY_MAX_BYTES } from "./brand-story";
import { getGeneratedAssetExportSpec } from "./generated-asset-files";
import type { HistoryEntry } from "./history";
import { PICTURE_WALL_EXPORT_SIZE, PICTURE_WALL_SOURCE_SIZE } from "./picture-wall";
import { getPlatform } from "./platforms";
import { pickDirectoryPath, pickSavePath, resizeAndSaveImage } from "./tauri";
import { replaceFileExtension, safeFileName } from "./utils";

async function fetchAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function joinPath(directoryPath: string, fileName: string) {
  if (directoryPath.endsWith("\\") || directoryPath.endsWith("/")) {
    return `${directoryPath}${fileName}`;
  }
  return `${directoryPath}\\${fileName}`;
}

export async function downloadHistoryEntry(entry: HistoryEntry): Promise<string[] | null> {
  const platform = getPlatform(entry.platform);
  const stem = safeFileName(entry.shopName);

  if (entry.kind === "picture_wall") {
    const directoryPath = await pickDirectoryPath("选择图片墙下载文件夹");
    if (!directoryPath) return null;
    const base64 = await fetchAsBase64(entry.remoteUrl);
    const saved: string[] = [];
    saved.push(
      await resizeAndSaveImage({
        base64_data: base64,
        target_width: PICTURE_WALL_SOURCE_SIZE.w,
        target_height: PICTURE_WALL_SOURCE_SIZE.h,
        output_path: joinPath(directoryPath, `${stem}_图片墙_高清原图.png`),
      })
    );
    saved.push(
      await resizeAndSaveImage({
        base64_data: base64,
        target_width: PICTURE_WALL_EXPORT_SIZE.w,
        target_height: PICTURE_WALL_EXPORT_SIZE.h,
        output_path: joinPath(
          directoryPath,
          `${stem}_图片墙_${PICTURE_WALL_EXPORT_SIZE.w}x${PICTURE_WALL_EXPORT_SIZE.h}.png`
        ),
      })
    );
    return saved;
  }

  if (entry.kind === "detail_page") {
    const fileName = `${stem}_详情页_${DETAIL_PAGE_EXPORT_SIZE.w}x${DETAIL_PAGE_EXPORT_SIZE.h}.png`;
    const selectedPath = await pickSavePath(fileName);
    if (!selectedPath) return null;
    const base64 = await fetchAsBase64(entry.remoteUrl);
    return [
      await resizeAndSaveImage({
        base64_data: base64,
        target_width: DETAIL_PAGE_EXPORT_SIZE.w,
        target_height: DETAIL_PAGE_EXPORT_SIZE.h,
        output_path: selectedPath,
      }),
    ];
  }

  if (entry.kind === "data_analysis") {
    const fileName = `${stem}_数据分析图_${DATA_ANALYSIS_EXPORT_SIZE.w}x${DATA_ANALYSIS_EXPORT_SIZE.h}.png`;
    const selectedPath = await pickSavePath(fileName);
    if (!selectedPath) return null;
    const base64 = await fetchAsBase64(entry.remoteUrl);
    return [
      await resizeAndSaveImage({
        base64_data: base64,
        target_width: DATA_ANALYSIS_EXPORT_SIZE.w,
        target_height: DATA_ANALYSIS_EXPORT_SIZE.h,
        output_path: selectedPath,
      }),
    ];
  }

  if (entry.kind === "patrol_script") {
    const fileName = `${stem}_巡店话术_${PATROL_SCRIPT_EXPORT_SIZE.w}x${PATROL_SCRIPT_EXPORT_SIZE.h}.png`;
    const selectedPath = await pickSavePath(fileName);
    if (!selectedPath) return null;
    const base64 = await fetchAsBase64(entry.remoteUrl);
    return [
      await resizeAndSaveImage({
        base64_data: base64,
        target_width: PATROL_SCRIPT_EXPORT_SIZE.w,
        target_height: PATROL_SCRIPT_EXPORT_SIZE.h,
        output_path: selectedPath,
      }),
    ];
  }

  if (entry.kind === "brand_story") {
    const config = resolveBrandStoryHistoryConfig(entry.remoteUrl);
    const { w, h } = config.exportSize;
    const fileName = `${stem}_品牌故事_${config.index}_${config.name}_${w}x${h}.jpg`;
    const selectedPath = await pickSavePath(fileName, [
      { name: "JPEG 图像", extensions: ["jpg", "jpeg"] },
    ]);
    if (!selectedPath) return null;
    const base64 = await fetchAsBase64(entry.remoteUrl);
    return [
      await resizeAndSaveImage({
        base64_data: base64,
        target_width: w,
        target_height: h,
        output_path: replaceFileExtension(selectedPath, "jpg"),
        max_bytes: BRAND_STORY_MAX_BYTES,
      }),
    ];
  }

  if (entry.kind === "product") {
    const spec = getGeneratedAssetExportSpec(entry.kind, entry.shopName, platform);
    const selectedPath = await pickSavePath(spec.fileName, [
      { name: "JPEG 图像", extensions: ["jpg", "jpeg"] },
    ]);
    if (!selectedPath) return null;
    const outputPath = replaceFileExtension(selectedPath, "jpg");
    const base64 = await fetchAsBase64(entry.remoteUrl);
    return [
      await resizeAndSaveImage({
        base64_data: base64,
        target_width: spec.targetWidth,
        target_height: spec.targetHeight,
        output_path: outputPath,
        max_bytes: spec.maxBytes,
      }),
    ];
  }

  // avatar / storefront / poster / p_signboard
  const spec = getGeneratedAssetExportSpec(entry.kind, entry.shopName, platform);
  const selectedPath = await pickSavePath(spec.fileName);
  if (!selectedPath) return null;
  const base64 = await fetchAsBase64(entry.remoteUrl);
  return [
    await resizeAndSaveImage({
      base64_data: base64,
      target_width: spec.targetWidth,
      target_height: spec.targetHeight,
      output_path: selectedPath,
    }),
  ];
}

function resolveBrandStoryHistoryConfig(remoteUrl: string) {
  const match = remoteUrl.match(/brand-story-(\d+)/i);
  const index = match ? Number.parseInt(match[1], 10) : 1;
  return (
    BRAND_STORY_IMAGE_CONFIGS.find((config) => config.index === index) ??
    BRAND_STORY_IMAGE_CONFIGS[0]
  );
}
