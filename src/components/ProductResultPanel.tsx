import { useState } from "react";
import { useToast } from "./Toast";
import type { GenerationItem, PlatformSpec } from "../types";
import GenerationResultTile from "./GenerationResultTile";
import "../styles/product-result-panel.css";

const PRODUCT_COPY_TEXT =
  "老板，您看下这是为店铺设计的产品图风格，后续全店图的设计风格都会以此来设计，该设计风格经过我们多轮市场检测 不管是点击率还是转化率都有非常好的效果，后续全店图设计完上传上去 您可以看下接下来的效果";

interface Props {
  platform: PlatformSpec;
  shopName: string;
  product: GenerationItem;
  onRetry: () => void;
  onDownload: () => void;
}

export default function ProductResultPanel({
  platform,
  shopName,
  product,
  onRetry,
  onDownload,
}: Props) {
  const toast = useToast();
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(PRODUCT_COPY_TEXT);
      setCopyState("success");
      toast.show("产品图沟通文案已复制到剪贴板", "success");
    } catch {
      setCopyState("error");
      toast.show("复制失败，请手动选中文案复制", "error");
    }
  }

  return (
    <div>
      <div className="results__head">
        <h2 className="section-heading" style={{ margin: 0 }}>
          生成结果
        </h2>
        <span className="meta-row">
          <span>
            店铺 <strong>{shopName || "—"}</strong>
          </span>
          <span>
            平台 <strong>{platform.label}</strong>
          </span>
        </span>
      </div>
      <div className="results">
        <GenerationResultTile
          title="产品主图"
          sub={`原图 ${platform.product.source.w}×${platform.product.source.h}`}
          item={product}
          exportSize={`${platform.product.export.w}×${platform.product.export.h}`}
          idleMessage="上传产品图后，点击「开始制作设计图」"
          onRetry={onRetry}
          onDownload={onDownload}
        />
      </div>
      <button
        className="product-copy-card"
        data-copy-state={copyState}
        onClick={handleCopy}
        type="button"
      >
        <span className="product-copy-card__eyebrow">商家沟通文案</span>
        <strong className="product-copy-card__title">点击整段文案可直接复制到剪贴板</strong>
        <span className="product-copy-card__body">{PRODUCT_COPY_TEXT}</span>
        <span className="product-copy-card__foot">
          {copyState === "success"
            ? "已复制到剪贴板"
            : copyState === "error"
              ? "复制失败，请重试"
              : "点击文案内容可以直接复制到剪切板"}
        </span>
      </button>
    </div>
  );
}
