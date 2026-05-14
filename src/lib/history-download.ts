import { DETAIL_PAGE_EXPORT_SIZE } from "./detail-page";
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
