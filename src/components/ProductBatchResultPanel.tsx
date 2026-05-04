import type { PlatformSpec } from "../types";
import type { ProductBatchEntry } from "../lib/product-batch";
import GenerationResultTile from "./GenerationResultTile";
import { IconImage } from "./Icons";
import "../styles/product-result-panel.css";

interface Props {
  platform: PlatformSpec;
  shopName: string;
  entries: ProductBatchEntry[];
  completedCount: number;
  onRetry: (sourceImageId: string) => void;
  onDownload: (sourceImageId: string) => void;
}

export default function ProductBatchResultPanel({
  platform,
  shopName,
  entries,
  completedCount,
  onRetry,
  onDownload,
}: Props) {
  const exportSize = `${platform.product.export.w}×${platform.product.export.h}`;

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
    </div>
  );
}
