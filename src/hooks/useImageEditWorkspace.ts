import type { ImageEditKind } from "../lib/image-edit";
import type { Options } from "./image-edit/types";
import { useImageEditState } from "./image-edit/useImageEditState";
import { createImageEditSingleAction } from "./image-edit/single-actions";
import { createImageEditBatchActions } from "./image-edit/batch-actions";
import { createImageEditDownloadActions } from "./image-edit/download-actions";

export default function useImageEditWorkspace(options: Options) {
  const state = useImageEditState();
  const context = { ...state, ...options };
  const generateSingle = createImageEditSingleAction(context);
  const { generateBatch, retryBatchItem } = createImageEditBatchActions(context);
  const downloads = createImageEditDownloadActions(context);

  async function generate(kind: ImageEditKind) {
    if (state.mode === "batch") await generateBatch(kind);
    else await generateSingle(kind);
  }

  const { setEntries: _setEntries, patchEntry: _patchEntry, createBatchSetter: _createBatchSetter, ...workspace } = state;
  return { ...workspace, generate, retryBatchItem, ...downloads };
}
