import type { GenerationItem, PlatformSpec } from "../types";
import GenerationResultTile from "./GenerationResultTile";
import MerchantCopyCard from "./MerchantCopyCard";
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
      <MerchantCopyCard text={PRODUCT_COPY_TEXT} successMessage="产品图沟通文案已复制到剪贴板" />
    </div>
  );
}
