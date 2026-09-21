import ImageUpload from "./ImageUpload";
import GenerationResultTile from "./GenerationResultTile";
import { IconSparkles } from "./Icons";
import type useMenuDesignWorkspace from "../hooks/useMenuDesignWorkspace";
import { MENU_SCREENSHOT_LIMIT, MENU_TEXT_LIMIT } from "../lib/menu-design";
import AppearanceFields from "./AppearanceFields";

interface Props { workspace: ReturnType<typeof useMenuDesignWorkspace>; globalBusy: boolean }

export default function MenuDesignPage({ workspace: w, globalBusy }: Props) {
  const disabled = w.busy || globalBusy;
  return <>
    <div className="panel-stack menu-design-form">
      <div className="field">
        <label className="field__label" htmlFor="menu-shop">店铺名称</label>
        <input id="menu-shop" className="input" value={w.storeName} maxLength={60} disabled={w.busy} onChange={(e) => w.setStoreName(e.target.value)} />
      </div>
      <AppearanceFields themeColor={w.themeColor} setThemeColor={w.setThemeColor} brandStyle={w.brandStyle} setBrandStyle={w.setBrandStyle} />
      <div className="field">
        <label className="field__label" htmlFor="menu-category">经营品类</label>
        <input id="menu-category" className="input" placeholder="例如：烧烤、生鲜、盖浇饭" value={w.category} maxLength={60} disabled={w.busy} onChange={(e) => w.setCategory(e.target.value)} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="menu-source">菜品信息</label>
        <textarea id="menu-source" className="input" rows={7} maxLength={MENU_TEXT_LIMIT} placeholder={"羊肉串 5元/串\n牛肉盖浇饭 22元/份"} value={w.text} disabled={w.busy} onChange={(e) => w.setText(e.target.value)} />
      </div>
      <div className="field">
        <span className="field__label">菜单截图（可单独上传）</span>
        <ImageUpload images={w.images} onChange={w.setImages} disabled={w.busy} maxCount={MENU_SCREENSHOT_LIMIT} referenceMaxDimension={2400} referenceQuality={0.95} dropzoneTitle="上传菜单截图" compressedLabel="菜单截图" />
      </div>
      <button className="btn btn--primary" onClick={w.organize} disabled={disabled || !w.category.trim() || (!w.text.trim() && !w.images.length)}>
        <IconSparkles />{w.phase === "text" ? "正在整理菜单…" : "整理菜单"}
      </button>
      <div className="field">
        <label className="field__label" htmlFor="menu-organized">整理后的菜单</label>
        <textarea id="menu-organized" className="input" rows={12} maxLength={MENU_TEXT_LIMIT} value={w.menu} disabled={w.busy} onChange={(e) => w.setMenu(e.target.value)} />
      </div>
      <button className="btn btn--primary" onClick={w.generate} disabled={disabled || !w.menu.trim() || !w.storeName.trim() || !w.category.trim()}>
        <IconSparkles />{w.phase === "image" ? "正在生成菜单图…" : "生成菜单图"}
      </button>
    </div>
    <div className="results">
      <GenerationResultTile title="菜单设计" sub={w.category} item={w.item} exportSize="原图" idleMessage="暂无菜单图" onDownload={w.download} onRetry={w.generate} actionsDisabled={disabled} previewZoom />
    </div>
  </>;
}
