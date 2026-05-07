import { useCallback, useEffect, useRef, useState } from "react";
import { extractClipboardImageFiles } from "../lib/clipboard-images";
import { compressImageFile } from "../lib/image-compression";
import { extractProductNameFromFileName, formatBytes, uid } from "../lib/utils";
import type { UploadedImage } from "../types";
import { IconUpload, IconClose, IconImage } from "./Icons";

interface Props {
  images: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  maxCount?: number;
  dropzoneTitle?: string;
  compressedLabel?: string;
  showProductName?: boolean;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_REFERENCE_MAX_DIMENSION = 1024;
const PRODUCT_REFERENCE_QUALITY = 0.85;

export default function ImageUpload({
  images,
  onChange,
  maxCount = 6,
  dropzoneTitle = "点击、拖拽或 Ctrl+V 粘贴产品图至此",
  compressedLabel = "产品图参考总",
  showProductName = false,
}: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);

  const ingest = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      const accepted: UploadedImage[] = [];
      for (const [index, f] of arr.entries()) {
        if (!ACCEPTED.includes(f.type)) continue;
        if (f.size > MAX_BYTES) continue;
        const compressed = await compressImageFile(f);
        const productCompressed = await compressImageFile(
          f,
          PRODUCT_REFERENCE_MAX_DIMENSION,
          PRODUCT_REFERENCE_QUALITY
        );
        accepted.push({
          id: uid(),
          base64: compressed.base64,
          productBase64: productCompressed.base64,
          dataUrl: compressed.dataUrl,
          name: resolveImageName(f, index),
          productName: extractProductNameFromFileName(resolveImageName(f, index)),
          mime: compressed.mime,
          size: compressed.size,
          productSize: productCompressed.size,
          originalSize: compressed.originalSize,
        });
      }
      const merged = [...images, ...accepted].slice(0, maxCount);
      onChange(merged);
    },
    [images, onChange, maxCount]
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!hoveredRef.current) return;
      const pastedFiles = extractClipboardImageFiles(event.clipboardData?.items);
      if (pastedFiles.length === 0) return;
      event.preventDefault();
      void ingest(pastedFiles);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ingest]);

  const remove = (id: string) => {
    onChange(images.filter((i) => i.id !== id));
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => { hoveredRef.current = true; }}
      onMouseLeave={() => { hoveredRef.current = false; }}
    >
      <div
        className="dropzone"
        data-drag={drag}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files) ingest(e.dataTransfer.files);
        }}
      >
        <IconUpload style={{ width: 18, height: 18, color: "var(--fg-muted)" }} />
        <div className="dropzone__title">{dropzoneTitle}</div>
        <div className="dropzone__hint">
          支持 PNG / JPEG / WebP · 支持剪贴板图片粘贴 · 自动压缩参考图 · 最多 {maxCount} 张
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) ingest(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {images.length === 0 ? null : (
        <>
          <div
            style={{
              fontSize: 11,
              color: "var(--fg-subtle)",
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <IconImage style={{ width: 12, height: 12 }} />
            已上传 {images.length} 张 · 参考图总{" "}
            {formatBytes(images.reduce((a, b) => a + b.size, 0))}
            {" "}· {compressedLabel}{" "}
            {formatBytes(images.reduce((a, b) => a + b.productSize, 0))}
            {" "}· 原图总{" "}
            {formatBytes(images.reduce((a, b) => a + b.originalSize, 0))}
          </div>
          <div className="thumbs">
            {images.map((img) => (
              <div className="thumb" key={img.id} title={img.name}>
                <img src={img.dataUrl} alt={img.name} />
                {showProductName ? (
                  <span className="thumb__product-name">{img.productName || "未识别产品名称"}</span>
                ) : null}
                <button
                  className="thumb__remove"
                  aria-label="移除"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(img.id);
                  }}
                >
                  <IconClose style={{ width: 12, height: 12 }} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function resolveImageName(file: File, index: number) {
  if (file.name.trim()) return file.name;
  const ext = file.type.split("/")[1] || "png";
  return `clipboard-image-${index + 1}.${ext}`;
}
