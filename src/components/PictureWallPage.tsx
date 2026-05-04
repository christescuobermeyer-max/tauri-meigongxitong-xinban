import { useState } from "react";
import type { PictureWallEntry } from "../lib/picture-wall";
import {
  buildPictureWallPrompt,
  PICTURE_WALL_EXPORT_SIZE,
  PICTURE_WALL_SOURCE_SIZE,
} from "../lib/picture-wall";
import type { PictureWallDownloadProgress } from "../lib/picture-wall-download";
import type { GenerationLine, UploadedImage } from "../types";
import GenerationLineCard from "./GenerationLineCard";
import ImageUpload from "./ImageUpload";
import { IconSparkles } from "./Icons";
import PictureWallProductNames from "./PictureWallProductNames";
import PictureWallResults from "./PictureWallResults";
import PromptPreview from "./PromptPreview";
import "../styles/picture-wall.css";
import "../styles/picture-wall-product-names.css";

interface Props {
  shopName: string;
  setShopName: (value: string) => void;
  images: UploadedImage[];
  setImages: (images: UploadedImage[]) => void;
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  entries: PictureWallEntry[];
  completedCount: number;
  downloadStatus: (PictureWallDownloadProgress & { active: boolean }) | null;
  busy: boolean;
  onGenerate: () => void;
  onDownload: () => void;
  onRetry: (sourceImageId: string) => void;
}

export default function PictureWallPage({
  shopName,
  setShopName,
  images,
  setImages,
  generationLine,
  setGenerationLine,
  entries,
  completedCount,
  downloadStatus,
  busy,
  onGenerate,
  onDownload,
  onRetry,
}: Props) {
  const [showPrompt, setShowPrompt] = useState(false);
  const canGenerate = shopName.trim().length > 0 && images.length === 3 && !busy;
  const previewImage = images[0];
  const previewProductName = previewImage?.productName?.trim() || "{产品名称}";
  const previewOssUrl = previewImage?.productOssUrl || "{上传后自动生成的产品图OSS链接}";

  return (
    <>
      <div className="panel-stack">
        <GenerationLineCard value={generationLine} onChange={setGenerationLine} />
        <section className="card">
          <div className="card__header">
            <div className="card__title">图片墙生成</div>
            <span className="card__hint">上传 3 张产品图，顺序生成美团图片墙</span>
          </div>
          <div className="card__body picture-wall-form">
            <div className="field">
              <label className="field__label">店铺名称</label>
              <input
                className="input"
                placeholder="例如：韩大叔炸鸡拌饭"
                value={shopName}
                onChange={(event) => setShopName(event.target.value)}
                maxLength={40}
              />
              <span className="field__hint">会以品牌标识艺术小字写入图片墙画面</span>
            </div>

            <div className="field">
              <label className="field__label">产品图片</label>
              <ImageUpload
                images={images}
                onChange={setImages}
                maxCount={3}
                dropzoneTitle="点击、拖拽或 Ctrl+V 粘贴 3 张图片墙产品图"
                compressedLabel="图片墙参考总"
                showProductName
              />
              <span className="field__hint">
                生成原图 {PICTURE_WALL_SOURCE_SIZE.w}×{PICTURE_WALL_SOURCE_SIZE.h}，下载包含高清原图和 {PICTURE_WALL_EXPORT_SIZE.w}×{PICTURE_WALL_EXPORT_SIZE.h}
              </span>
              <PictureWallProductNames images={images} />
            </div>

            <div className="field">
              <label className="field__label">
                生成提示词
                <button
                  className="btn btn--link"
                  onClick={() => setShowPrompt((value) => !value)}
                  type="button"
                >
                  {showPrompt ? "收起" : "查看"}
                </button>
              </label>
              {showPrompt ? (
                <PromptPreview
                  title="图片墙 prompt · 3:4"
                  text={buildPictureWallPrompt(
                    shopName || "{店铺名称}",
                    previewProductName,
                    previewOssUrl
                  )}
                />
              ) : (
                <span className="field__hint">
                  prompt 会引用店铺名称、每张图自动提取的产品名称，以及上传到 OSS 后的产品图链接。
                </span>
              )}
            </div>

            <div className="picture-wall-actions">
              <button className="btn btn--primary btn--lg" disabled={!canGenerate} onClick={onGenerate}>
                <IconSparkles style={{ width: 14, height: 14 }} />
                {busy ? "生成中…" : "生成图片墙"}
              </button>
            </div>
          </div>
        </section>
      </div>

      <PictureWallResults
        entries={entries}
        shopName={shopName}
        completedCount={completedCount}
        downloadStatus={downloadStatus}
        busy={busy}
        onDownload={onDownload}
        onRetry={onRetry}
      />
    </>
  );
}
