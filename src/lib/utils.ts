/** 把 File 读成 base64 字符串（不含 data: 前缀） */
export function fileToBase64(file: File): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve({ base64, dataUrl });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** "卤味·张三" → "卤味_张三"，过滤文件名非法字符 */
export function safeFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, "_").trim() || "shop";
}

export function replaceFileExtension(path: string, ext: string): string {
  const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
  const slashIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const dir = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "";
  const file = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = file.lastIndexOf(".");

  if (dotIndex <= 0) return `${path}${normalizedExt}`;
  return `${dir}${file.slice(0, dotIndex)}${normalizedExt}`;
}

export function extractProductNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
