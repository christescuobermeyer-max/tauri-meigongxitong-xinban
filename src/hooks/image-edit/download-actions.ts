import type { ImageEditKind } from "../../lib/image-edit";
import { downloadImageEditBatchItem, downloadImageEditBatchItems } from "../../lib/image-edit-batch-download";
import { saveGeneratedAsset } from "../../lib/save-generated-asset";
import type { Options } from "./types";
import type { useImageEditState } from "./useImageEditState";
import { resolveImageEditProductName } from "./utils";
type Context = ReturnType<typeof useImageEditState> & Options;

export function createImageEditDownloadActions(context: Context) {
  const { onToast, shopName, currentPlatform, entries } = context;
  async function download(kind: ImageEditKind) {
    const entry = entries[kind];
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    try {
      const productName = kind === "product" ? resolveImageEditProductName(entry.images) : undefined;
      const saved = await saveGeneratedAsset(kind, entry.item, shopName || "修改图片", currentPlatform, productName);
      if (saved) onToast(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      onToast(`保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function downloadBatchItem(kind: ImageEditKind, sourceImageId: string) {
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    await downloadImageEditBatchItem({
      kind,
      entries: entries[kind].batchEntries,
      sourceImageId,
      shopName,
      currentPlatform,
      onToast,
    });
  }

  async function downloadBatchAll(kind: ImageEditKind) {
    if (!currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    await downloadImageEditBatchItems({
      kind,
      entries: entries[kind].batchEntries,
      shopName,
      currentPlatform,
      onToast,
    });
  }

  return { download, downloadBatchItem, downloadBatchAll };
}
