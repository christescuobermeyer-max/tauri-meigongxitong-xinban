import type { DetailPageEntry } from "../lib/detail-page";
import { DETAIL_PAGE_EXPORT_SIZE } from "../lib/detail-page";
import BatchDownloadButton from "./BatchDownloadButton";
import GenerationResultTile from "./GenerationResultTile";
import { IconImage } from "./Icons";
import MerchantCopyCard from "./MerchantCopyCard";

const DETAIL_PAGE_COPY_TEXT =
  `老板，我们分析了您店铺的销售数据，把您家销量最高、人气最好的1款产品挑出来，专门做了一套精美的详情页图，已经上线了。您可以打开店铺看看效果。详情页图这个东西很多老板不知道，但从数据上看它对转化率的影响其实很大。顾客点进人气商品之后，如果只看到一张主图就没了，很容易犹豫一下就退出去了。但如果有详情页图展示食材用料、制作工艺、分量实拍这些内容，顾客的信任感会强很多，下单的概率能提升20%-30%。我们给您做的这三张图就是按照高转化的逻辑来设计的，把您产品的卖点和优势都展示出来了。
还有一点很关键，美团现在有个"优质商品"的标签认证，平台会根据人气商品的图片质量、详情完整度、销量评分这些维度来评判。有了详情页图之后，您这1款爆品更容易拿到优质商品的标签，平台会给贴标商品更多的曝光倾斜，在搜索结果和推荐位里排名会更靠前。说白了就是平台觉得您这个商品展示得专业、信息完整，更愿意把流量给您。`;

interface Props {
  entries: DetailPageEntry[];
  shopName: string;
  completedCount: number;
  busy: boolean;
  onRetry: (pageIndex: number) => void;
  onDownload: () => void;
  onDownloadItem: (pageIndex: number) => void;
}

export default function DetailPageResults({
  entries,
  shopName,
  completedCount,
  busy,
  onRetry,
  onDownload,
  onDownloadItem,
}: Props) {
  const exportSize = `${DETAIL_PAGE_EXPORT_SIZE.w}×${DETAIL_PAGE_EXPORT_SIZE.h}`;
  const canDownload = completedCount > 0 && !busy;

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
            已完成 <strong>{completedCount}</strong> / 3
          </span>
        </span>
        <BatchDownloadButton
          label="批量下载详情页"
          meta={`已完成 ${completedCount}/3`}
          disabled={!canDownload}
          onClick={onDownload}
          title="批量下载已生成成功的详情页图"
        />
      </div>

      {entries.length === 0 ? (
        <div className="result">
          <div className="result__body">
            <div className="result__placeholder">
              <IconImage style={{ width: 22, height: 22, color: "var(--fg-faint)" }} />
              <strong>上传产品图后，即可生成 3 张详情页展示图</strong>
              <span>主KV视觉、生活场景、工艺展示会按顺序生成</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="detail-page-grid">
          {entries.map((entry) => (
            <GenerationResultTile
              key={entry.pageIndex}
              title={entry.title}
              sub={entry.subtitle}
              item={entry.item}
              exportSize={exportSize}
              idleMessage="开始生成后会在这里展示详情页图"
              compact
              onRetry={() => onRetry(entry.pageIndex)}
              onDownload={() => onDownloadItem(entry.pageIndex)}
            />
          ))}
        </div>
      )}
      <MerchantCopyCard text={DETAIL_PAGE_COPY_TEXT} successMessage="详情页沟通文案已复制到剪贴板" />
    </div>
  );
}
