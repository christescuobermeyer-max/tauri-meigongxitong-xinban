const DEFAULT_MAX_DIMENSION = 512;
const DEFAULT_JPEG_QUALITY = 0.62;

export interface CompressedImage {
  base64: string;
  dataUrl: string;
  mime: string;
  size: number;
  originalSize: number;
}

export function calculateScaledSize(
  width: number,
  height: number,
  maxDimension = DEFAULT_MAX_DIMENSION
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };

  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function compressImageFile(
  file: File,
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = DEFAULT_JPEG_QUALITY
): Promise<CompressedImage> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(sourceUrl);
    const target = calculateScaledSize(img.naturalWidth, img.naturalHeight, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建图片压缩画布");

    // JPEG 不支持透明通道，用白底避免透明产品图变黑。
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(img, 0, 0, target.width, target.height);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;

    return {
      base64,
      dataUrl,
      mime: "image/jpeg",
      size: Math.ceil((base64.length * 3) / 4),
      originalSize: file.size,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}
