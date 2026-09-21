import type {
  AvatarReferenceMode,
  BrandStyle,
  GenerationItem,
  ThemeColor,
  UploadedImage,
} from "../types";
import { getAvatarGenerationErrorMessage } from "../lib/avatar-generation";
import {
  THREE_PIECE_LABEL,
  THREE_PIECE_ORDER,
  formatThreePieceSelection,
  getSelectedThreePieceKinds,
  type ThreePieceAssetKind,
  type ThreePieceSelection,
} from "../lib/three-piece-selection";
import AppearanceFields from "./AppearanceFields";
import ImageUpload from "./ImageUpload";
import { IconSparkles } from "./Icons";
import ProgressSteps from "./ProgressSteps";

interface Props {
  shopName: string;
  setShopName: (v: string) => void;
  avatarMode: AvatarReferenceMode;
  avatarCategory: string;
  setAvatarCategory: (v: string) => void;
  themeColor: ThemeColor | "";
  setThemeColor: (v: ThemeColor | "") => void;
  brandStyle: BrandStyle | "";
  setBrandStyle: (v: BrandStyle | "") => void;
  selectedKinds: ThreePieceSelection;
  onToggleSelectedKind: (kind: ThreePieceAssetKind) => void;
  images: UploadedImage[];
  setImages: (imgs: UploadedImage[]) => void;
  onGenerate: () => void;
  busy: boolean;
  submitDisabled?: boolean;
  elapsed: number;
  avatar: GenerationItem;
  storefront: GenerationItem;
  poster: GenerationItem;
}

export default function GeneratePanel(props: Props) {
  const {
    shopName,
    setShopName,
    avatarMode,
    avatarCategory,
    setAvatarCategory,
    themeColor,
    setThemeColor,
    brandStyle,
    setBrandStyle,
    selectedKinds,
    onToggleSelectedKind,
    images,
    setImages,
    onGenerate,
    busy,
    submitDisabled = busy,
    elapsed,
    avatar,
    storefront,
    poster,
  } = props;
  const selectedAssetKinds = getSelectedThreePieceKinds(selectedKinds);
  const selectedLabel = formatThreePieceSelection(selectedKinds);
  const canSubmit =
    getAvatarGenerationErrorMessage({ shopName, mode: avatarMode, category: avatarCategory, images }) === null &&
    selectedAssetKinds.length > 0 &&
    !submitDisabled;
  const steps = [
    { kind: "avatar", label: "生成店铺头像", item: avatar },
    { kind: "storefront", label: "参考产品图生成店招", item: storefront },
    { kind: "poster", label: "参考产品图生成海报", item: poster },
  ].filter((step) => selectedKinds[step.kind as ThreePieceAssetKind]);

  return (
    <div className="panel-stack">
      <div className="card">
        <div className="card__header">
          <div className="card__heading">
            <div className="card__title">店铺信息</div>
            <span className="card__hint">选择需要生成的图片类型，默认生成完整三件套</span>
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
            <span className="field__hint">将以醒目方式呈现在头像与店招画面中</span>
          </div>

          <div className="field">
            <label className="field__label">店铺经营品类</label>
            <input
              className="input"
              placeholder="例如：炸货、盖浇饭、黄焖鸡、奶茶"
              value={avatarCategory}
              onChange={(e) => setAvatarCategory(e.target.value)}
              maxLength={20}
            />
            <span className="field__hint">必填，用于告诉系统店铺主要卖什么</span>
          </div>

          <AppearanceFields
            themeColor={themeColor}
            setThemeColor={setThemeColor}
            brandStyle={brandStyle}
            setBrandStyle={setBrandStyle}
          />

          <div className="field">
            <label className="field__label">本次生成项目</label>
            <div className="three-piece-selection" role="group" aria-label="本次生成项目">
              {THREE_PIECE_ORDER.map((kind) => (
                <label
                  key={kind}
                  className="three-piece-selection__item"
                  data-active={selectedKinds[kind]}
                >
                  <input
                    type="checkbox"
                    checked={selectedKinds[kind]}
                    disabled={busy}
                    onChange={() => onToggleSelectedKind(kind)}
                  />
                  <span>{THREE_PIECE_LABEL[kind]}</span>
                </label>
              ))}
            </div>
            <span className="field__hint">默认全选，取消勾选后本次不会生成对应图片</span>
          </div>

          <div className="field">
            <label className="field__label">产品图（参考素材）</label>
            <ImageUpload images={images} onChange={setImages} maxCount={5} />
            <span className="field__hint">
              必传。头像、店招和海报都会参考上传的产品图，不再沿用已生成头像
            </span>
          </div>

          <div style={{ marginTop: 18 }}>
            <button className="btn btn--primary btn--block btn--lg" disabled={!canSubmit} onClick={onGenerate}>
              <IconSparkles style={{ width: 14, height: 14 }} />
              {busy ? "生成中…" : `开始生成${selectedLabel}`}
            </button>
            {busy && (
              <ProgressSteps
                elapsedMs={elapsed}
                steps={steps.map((step, index) => ({
                  index: index + 1,
                  label: step.label,
                  item: step.item,
                }))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
