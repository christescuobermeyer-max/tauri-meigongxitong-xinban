import { generateImageWithLine, uploadImageToOss } from "./tauri";
import { compressAndArchiveGenerated } from "./oss-assets";
import { resolvePSignboardGenerationSize } from "./generation-size";
import { runWithAutoRetry } from "./generation-retry";
import { safeFileName } from "./utils";
import type { GenerationItem, GenerationLine, UploadedImage } from "../types";

export interface PSignboardOptions {
  shopName: string;
  originalText: string;
  newText: string;
  generationLine?: GenerationLine;
  onAttempt?: (attempt: number) => void;
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
  const generationLine = options.generationLine ?? "line1";
  const sourceUpload = await uploadImageToOss({
    base64_data: image.productBase64,
    mime_type: image.mime,
    folder: "uploads",
    file_name: `${stem}-p-signboard-source-${image.id}.jpg`,
  });
  const started = Date.now();
  const generated = await runWithAutoRetry({
    onAttempt: (attempt) => options.onAttempt?.(attempt),
    run: async () => {
      const response = await generateImageWithLine({
        prompt: buildPSignboardPrompt(sourceUpload.url, options.originalText, options.newText),
        size: resolvePSignboardGenerationSize(generationLine),
        product_images: [sourceUpload.url],
        api_line: "auto",
      });
      return {
        rawBase64: response.image,
        generationLine: response.generationLine,
      };
    },
  });
  const remoteUrl = await compressAndArchiveGenerated(
    "p_signboard",
    generated.rawBase64,
    `${stem}-p-signboard-${Date.now()}`
  );

  return {
    kind: "p_signboard",
    rawBase64: generated.rawBase64,
    rawDataUrl: `data:image/png;base64,${generated.rawBase64}`,
    remoteUrl,
    generationLine: generated.generationLine,
    status: "succeeded",
    elapsedMs: Date.now() - started,
    attempt: generated.attempt,
  };
}
