import { generateArchivedImageWithLine, uploadImageToOss } from "./tauri";
import { resolveGeneratedArchiveUrl } from "./oss-assets";
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
  const generationLine = options.generationLine ?? "line5";
  const resultStem = `${stem}-p-signboard-${Date.now()}`;
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
      const response = await generateArchivedImageWithLine(
        {
          prompt: buildPSignboardPrompt(sourceUpload.url, options.originalText, options.newText),
          size: resolvePSignboardGenerationSize(generationLine),
          product_images: [sourceUpload.url],
          api_line: "auto",
        },
        {
          asset_kind: "p_signboard",
          file_name_stem: resultStem,
          shop_name: options.shopName,
          platform: "meituan",
        }
      );
      return {
        rawBase64: response.image,
        rawDataUrl: response.imageDataUrl,
        generationLine: response.generationLine,
        archiveUrl: response.archiveUrl,
        archiveError: response.archiveError,
        historyRecorded: response.historyRecorded,
        historyError: response.historyError,
      };
    },
  });
  const remoteUrl = await resolveGeneratedArchiveUrl(
    "p_signboard",
    generated.rawBase64,
    resultStem,
    generated
  );

  return {
    kind: "p_signboard",
    rawBase64: generated.rawBase64,
    rawDataUrl: generated.rawDataUrl ?? `data:image/png;base64,${generated.rawBase64}`,
    remoteUrl,
    generationLine: generated.generationLine,
    status: "succeeded",
    elapsedMs: Date.now() - started,
    attempt: generated.attempt,
    historyRecorded: generated.historyRecorded,
    historyError: generated.historyError,
  };
}
