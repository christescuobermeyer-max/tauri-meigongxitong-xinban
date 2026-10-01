import { useState, type Dispatch, type SetStateAction } from "react";
import { IMAGE_EDIT_KINDS, getImageEditSourceMaxCount, syncImageEditBatchEntries, applyImageEditBatchEntryUpdate, hasBusyImageEditBatchEntries, type ImageEditKind, type ImageEditMode } from "../../lib/image-edit";
import { emptyItem, isBusyStatus } from "../../lib/workspace-session";
import { getPlatform } from "../../lib/platforms";
import type { GenerationItem, Platform, PlatformSpec, UploadedImage } from "../../types";
import type { Entry, Entries } from "./types";

function createEntries(): Entries {
  return IMAGE_EDIT_KINDS.reduce((acc, kind) => {
    acc[kind] = {
      images: [],
      referenceImages: [],
      instruction: "",
      item: emptyItem(kind),
      batchEntries: [],
    };
    return acc;
  }, {} as Entries);
}

export function useImageEditState() {
  const [shopName, setShopName] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [mode, setModeState] = useState<ImageEditMode>("single");
  const [entries, setEntries] = useState<Entries>(() => createEntries());

  const currentPlatform: PlatformSpec | null = platform ? getPlatform(platform) : null;
  const busy = IMAGE_EDIT_KINDS.some(
    (kind) => isBusyStatus(entries[kind].item.status) || hasBusyImageEditBatchEntries(entries[kind].batchEntries)
  );

  function patchEntry(kind: ImageEditKind, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
  }

  function setMode(nextMode: ImageEditMode) {
    if (busy) return;
    setModeState(nextMode);
    if (nextMode !== "single") return;

    setEntries((prev) => {
      const next = { ...prev };
      for (const kind of IMAGE_EDIT_KINDS) {
        const images = prev[kind].images.slice(0, getImageEditSourceMaxCount(kind, "single"));
        next[kind] = {
          ...prev[kind],
          images,
          batchEntries: syncImageEditBatchEntries(kind, images, prev[kind].batchEntries),
        };
      }
      return next;
    });
  }

  function setImages(kind: ImageEditKind, images: UploadedImage[]) {
    setEntries((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        images,
        batchEntries: syncImageEditBatchEntries(kind, images, prev[kind].batchEntries),
      },
    }));
  }

  function setReferenceImages(kind: ImageEditKind, referenceImages: UploadedImage[]) {
    patchEntry(kind, { referenceImages });
  }

  function setInstruction(kind: ImageEditKind, instruction: string) {
    patchEntry(kind, { instruction });
  }

  function createBatchSetter(
    kind: ImageEditKind,
    sourceImageId: string
  ): Dispatch<SetStateAction<GenerationItem>> {
    return (next) => {
      setEntries((prev) => ({
        ...prev,
        [kind]: {
          ...prev[kind],
          batchEntries: applyImageEditBatchEntryUpdate(prev[kind].batchEntries, sourceImageId, next),
        },
      }));
    };
  }

  return { shopName, setShopName, platform, setPlatform, mode, setMode, currentPlatform, entries, busy,
    setEntries, patchEntry, createBatchSetter, setImages, setReferenceImages, setInstruction };
}
