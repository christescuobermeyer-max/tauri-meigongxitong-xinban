import type { GenerationItem, PlatformSpec } from "../types";
import GenerationResultTile from "./GenerationResultTile";
import { IconDownload } from "./Icons";
import MerchantCopyCard from "./MerchantCopyCard";
import "../styles/product-result-panel.css";

const PRODUCT_COPY_TEXT =
  "老板，您看下这是为店铺设计的产品图风格，后续全店图的设计风格都会以此来设计，该设计风格经过我们多轮市场检测 不管是点击率还是转化率都有非常好的效果，后续全店图设计完上传上去 您可以看下接下来的效果";

interface Props {
  platform: PlatformSpec | null;
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
  const canDownload = product.status === "succeeded";
  const source = platform?.product.source;
  const target = platform?.product.export;

  return (
    <div>
      <div className="results__head">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="section-heading" style={{ margin: 0 }}>
            生成结果
          </h2>
          <span className="meta-row">
            <span>
              店铺 <strong>{shopName || "—"}</strong>
            </span>
            <span>
              平台 <strong>{platform?.label ?? "未选择"}</strong>
            </span>
          </span>
        </div>
        <button
          className="batch-download-btn"
          onClick={onDownload}
          disabled={!canDownload}
        >
          <span className="batch-download-btn__icon">
            <IconDownload style={{ width: 15, height: 15 }} />
          </span>
          <span className="batch-download-btn__label">下载设计图</span>
        </button>
      </div>
      <div className="results">
        <GenerationResultTile
          title="产品主图"
          sub={source ? `原图 ${source.w}×${source.h}` : "请先选择投放平台"}
          item={product}
          exportSize={target ? `${target.w}×${target.h}` : "请选择平台"}
          idleMessage="上传产品图后，点击「开始制作设计图」"
          onRetry={onRetry}
          onDownload={onDownload}
        />
      </div>
      <MerchantCopyCard text={PRODUCT_COPY_TEXT} successMessage="产品图沟通文案已复制到剪贴板" />
    </div>
  );
}
