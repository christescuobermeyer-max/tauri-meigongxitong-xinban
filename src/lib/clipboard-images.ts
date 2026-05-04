interface ClipboardImageItem {
  kind: string;
  type: string;
  getAsFile: () => File | null;
}

export function extractClipboardImageFiles(
  items: Iterable<ClipboardImageItem> | null | undefined
): File[] {
  if (!items) return [];

  return Array.from(items).flatMap((item) => {
    if (item.kind !== "file") return [];
    if (!item.type.startsWith("image/")) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}
