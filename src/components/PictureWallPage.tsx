import type { PictureWallEntry } from "../lib/picture-wall";
import { PICTURE_WALL_EXPORT_SIZE, PICTURE_WALL_SOURCE_SIZE } from "../lib/picture-wall";
import type { PictureWallDownloadProgress } from "../lib/picture-wall-download";
import type { BrandStyle, ThemeColor, UploadedImage } from "../types";
import AppearanceFields from "./AppearanceFields";
import GenerationLineCard from "./GenerationLineCard";
import ImageUpload from "./ImageUpload";
import { IconSparkles } from "./Icons";
import PictureWallProductNames from "./PictureWallProductNames";
import PictureWallResults from "./PictureWallResults";
import "../styles/picture-wall.css";
import "../styles/picture-wall-product-names.css";

interface Props {
  shopName: string;
  setShopName: (value: string) => void;
  images: UploadedImage[];
  setImages: (images: UploadedImage[]) => void;
  themeColor: ThemeColor | "";
  setThemeColor: (v: ThemeColor | "") => void;
  brandStyle: BrandStyle | "";
  setBrandStyle: (v: BrandStyle | "") => void;
  entries: PictureWallEntry[];
  completedCount: number;
  downloadStatus: (PictureWallDownloadProgress & { active: boolean }) | null;
  busy: boolean;
  submitDisabled?: boolean;
  onGenerate: () => void;
  onDownload: () => void;
  onDownloadSingle: (sourceImageId: string) => void;
  onRetry: (sourceImageId: string) => void;
}

export default function PictureWallPage({
  shopName,
  setShopName,
  images,
  setImages,
  themeColor,
  setThemeColor,
  brandStyle,
  setBrandStyle,
  entries,
  completedCount,
  downloadStatus,
  busy,
  submitDisabled = busy,
  onGenerate,
  onDownload,
  onDownloadSingle,
  onRetry,
}: Props) {
  const canGenerate = shopName.trim().length > 0 && images.length === 3 && !submitDisabled;
  const failedCount = entries.filter((entry) => entry.item.status === "failed").length;
  const generateLabel = failedCount > 0 ? `补生成失败图片（${failedCount}张）` : "生成图片墙";

  return (
    <>
      <div className="panel-stack">
        <GenerationLineCard />
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

            <AppearanceFields
              themeColor={themeColor}
              setThemeColor={setThemeColor}
              brandStyle={brandStyle}
              setBrandStyle={setBrandStyle}
            />

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

            <div className="picture-wall-actions">
              <button className="btn btn--primary btn--lg" disabled={!canGenerate} onClick={onGenerate}>
                <IconSparkles style={{ width: 14, height: 14 }} />
                {busy ? "生成中…" : generateLabel}
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
        onDownloadSingle={onDownloadSingle}
        onRetry={onRetry}
      />
    </>
  );
}
