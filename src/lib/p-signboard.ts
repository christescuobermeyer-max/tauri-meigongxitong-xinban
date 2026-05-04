import { generateImage, uploadImageToOss } from "./tauri";
import { safeFileName } from "./utils";
import type { GenerationItem, GenerationLine, UploadedImage } from "../types";

export interface PSignboardOptions {
  shopName: string;
  originalText: string;
  newText: string;
  generationLine?: GenerationLine;
}

export function buildPSignboardPrompt(ossUrl: string, originalText: string, newText: string): string {
  const sourceUrl = ossUrl.trim();
  const source = originalText.trim();
  const target = newText.trim();
  return `将上传的门头图片oss的url ${sourceUrl} 中原有文字内容“${source}”替换成新文字内容“${target}”，其他内容保持不变。`;
}

export async function generatePSignboardItem(
  image: UploadedImage,
  options: PSignboardOptions
): Promise<GenerationItem> {
  const stem = safeFileName(options.shopName);
  const sourceUpload = await uploadImageToOss({
    base64_data: image.productBase64,
    mime_type: image.mime,
    folder: "uploads",
    file_name: `${stem}-p-signboard-source-${image.id}.jpg`,
  });
  const started = Date.now();
  const rawBase64 = await generateImage({
    prompt: buildPSignboardPrompt(sourceUpload.url, options.originalText, options.newText),
    size: "1536x1024",
    product_images: [sourceUpload.url],
    api_line: options.generationLine ?? "line1",
  });
  const resultUpload = await uploadImageToOss({
    base64_data: rawBase64,
    mime_type: "image/png",
    folder: "generated",
    file_name: `${stem}-p-signboard-${Date.now()}.png`,
  });

  return {
    kind: "p_signboard",
    rawBase64,
    rawDataUrl: `data:image/png;base64,${rawBase64}`,
    remoteUrl: resultUpload.url,
    generationLine: options.generationLine ?? "line1",
    status: "succeeded",
    elapsedMs: Date.now() - started,
  };
}
