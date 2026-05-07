import type { PlatformSpec } from "../types";
import type { ProductBatchEntry } from "../lib/product-batch";
import BatchDownloadButton from "./BatchDownloadButton";
import GenerationResultTile from "./GenerationResultTile";
import { IconImage } from "./Icons";
import MerchantCopyCard from "./MerchantCopyCard";
import "../styles/product-result-panel.css";

const FULL_STORE_COPY_TEXT =
  "老板,您店铺的10张全店图我们已经做好，您看下没问题的话就按照这种来制作了。这批图片我们是按照多家店铺测试过的高转化模板来设计的,从数据上看,用这种风格的图片点击率能提升30%以上,进店转化也会明显更好。图片已经全部替换上去了,您可以打开店铺看看效果。";

interface Props {
  platform: PlatformSpec | null;
  shopName: string;
  entries: ProductBatchEntry[];
  completedCount: number;
  onRetry: (sourceImageId: string) => void;
  onDownload: (sourceImageId: string) => void;
  onBatchDownload: () => void;
}

export default function ProductBatchResultPanel({
  platform,
  shopName,
  entries,
  completedCount,
  onRetry,
  onDownload,
  onBatchDownload,
}: Props) {
  const exportSize = platform ? `${platform.product.export.w}×${platform.product.export.h}` : "请选择平台";
  const downloadTotal = entries.length || 0;

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
            已完成 <strong>{completedCount}</strong> / {entries.length || 0}
          </span>
        </span>
        <BatchDownloadButton
          label="批量下载全店图"
          meta={`已完成 ${completedCount}/${downloadTotal}`}
          disabled={completedCount === 0 || !platform}
          onClick={onBatchDownload}
          title="批量下载已生成成功的全店图"
        />
      </div>

      {entries.length === 0 ? (
        <div className="result">
          <div className="result__body">
            <div className="result__placeholder">
              <IconImage style={{ width: 22, height: 22, color: "var(--fg-faint)" }} />
              <strong>上传产品图和参考设计风格图后，即可批量制作全店图</strong>
              <span>最多一次 10 张，会按各产品图文件名自动替换产品名称</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="product-batch-grid">
          {entries.map((entry) => (
            <GenerationResultTile
              key={entry.sourceImageId}
              title={entry.productName}
              sub={entry.sourceName}
              item={entry.item}
              exportSize={exportSize}
              idleMessage="开始制作后会在这里展示"
              compact
              onRetry={() => onRetry(entry.sourceImageId)}
              onDownload={() => onDownload(entry.sourceImageId)}
            />
          ))}
        </div>
      )}
      <MerchantCopyCard text={FULL_STORE_COPY_TEXT} successMessage="全店图沟通文案已复制到剪贴板" />
    </div>
  );
}
