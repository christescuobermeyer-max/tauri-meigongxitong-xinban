import type { GenerationItem } from "../types";

export function canCopyGeneratedItemImage(item: GenerationItem): boolean {
  return item.status === "succeeded" && Boolean(item.rawBase64);
}

export async function copyGeneratedItemImage(item: GenerationItem): Promise<void> {
  if (!canCopyGeneratedItemImage(item) || !item.rawBase64) {
    throw new Error("当前图片尚未生成，无法复制");
  }
  await copyImageBlobToClipboard(base64ToBlob(item.rawBase64, "image/png"));
}

export async function copyImageUrlToClipboard(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`读取图片失败：HTTP ${response.status}`);
  const blob = await response.blob();
  await copyImageBlobToClipboard(blob.type.startsWith("image/") ? blob : new Blob([blob], { type: "image/png" }));
}

export async function copyImageBlobToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("当前环境不支持图片复制到剪贴板");
  }
  const mime = blob.type || "image/png";
  await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64.includes(",") ? base64.split(",")[1] : base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
