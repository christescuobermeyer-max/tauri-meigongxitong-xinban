import type {
  BrandStyle,
  GenerationItem,
  Platform,
  ThemeColor,
  UploadedImage,
} from "../types";
import { getPlatform } from "../lib/platforms";
import AppearanceFields from "./AppearanceFields";
import PlatformSelect from "./PlatformSelect";
import GenerationLineCard from "./GenerationLineCard";
import ImageUpload from "./ImageUpload";
import { IconSparkles } from "./Icons";
import ProgressSteps from "./ProgressSteps";

interface Props {
  shopName: string;
  setShopName: (v: string) => void;
  productName: string;
  setProductName: (v: string) => void;
  platform: Platform | null;
  setPlatform: (p: Platform) => void;
  themeColor: ThemeColor | "";
  setThemeColor: (v: ThemeColor | "") => void;
  brandStyle: BrandStyle | "";
  setBrandStyle: (v: BrandStyle | "") => void;
  images: UploadedImage[];
  setImages: (imgs: UploadedImage[]) => void;
  onGenerate: () => void;
  busy: boolean;
  submitDisabled?: boolean;
  elapsed: number;
  product: GenerationItem;
}

export default function ProductGeneratePanel({
  shopName,
  setShopName,
  productName,
  setProductName,
  platform,
  setPlatform,
  themeColor,
  setThemeColor,
  brandStyle,
  setBrandStyle,
  images,
  setImages,
  onGenerate,
  busy,
  submitDisabled = busy,
  elapsed,
  product,
}: Props) {
  const platformSpec = platform ? getPlatform(platform) : null;
  const canSubmit =
    Boolean(platform) && shopName.trim().length > 0 && productName.trim().length > 0 && images.length > 0 && !submitDisabled;
  const source = platformSpec?.product.source;
  const target = platformSpec?.product.export;
  const fileHint = platformSpec?.product.maxBytes
    ? ` · JPG 不超过 ${Math.floor(platformSpec.product.maxBytes / 1024)}KB`
    : "";

  return (
    <div className="panel-stack">
      <GenerationLineCard />
      <div className="card">
        <div className="card__header">
          <div className="card__heading">
            <div className="card__title">制作1张设计图</div>
            <span className="card__hint">基于参考产品图重新设计 1 张高质感产品主图</span>
          </div>
        </div>

        <div className="card__body">
          <div className="field">
            <label className="field__label">店铺名称</label>
            <input
              className="input"
              placeholder="例如：阿牛黄焖鸡米饭（火车站店）"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              maxLength={40}
            />
            <span className="field__hint">会结合店铺名气质，对产品图做更精致的视觉重设计</span>
          </div>

          <div className="field">
            <label className="field__label">投放平台</label>
            <PlatformSelect value={platform} onChange={setPlatform} />
            <span className="field__hint">
              {platformSpec ?
                `原图 ${source?.w}×${source?.h} · 导出 ${target?.w}×${target?.h}${fileHint}` :
                "请先选择美团或淘宝闪购，系统会按所选平台生成对应尺寸"}
            </span>
          </div>

          <div className="field">
            <label className="field__label">产品名称</label>
            <input
              className="input"
              placeholder="会从第 1 张产品图文件名自动带出"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              maxLength={40}
            />
            <span className="field__hint">默认从上传文件名提取，可手动修改，生成时会写入图中</span>
          </div>

          <AppearanceFields
            themeColor={themeColor}
            setThemeColor={setThemeColor}
            brandStyle={brandStyle}
            setBrandStyle={setBrandStyle}
          />

          <div className="field">
            <label className="field__label">产品图（参考素材）</label>
            <ImageUpload images={images} onChange={setImages} maxCount={1} />
            <span className="field__hint">
              仅支持上传 1 张产品图，会发送更高清的产品图参考版本给生成接口
            </span>
          </div>

          <div style={{ marginTop: 18 }}>
            <button
              className="btn btn--primary btn--block btn--lg"
              disabled={!canSubmit}
              onClick={onGenerate}
            >
              <IconSparkles style={{ width: 14, height: 14 }} />
              {busy ? "制作中…" : "开始制作设计图"}
            </button>
            {busy && (
              <ProgressSteps
                elapsedMs={elapsed}
                steps={[{ index: 1, label: "调用系统制作设计图", item: product }]}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
