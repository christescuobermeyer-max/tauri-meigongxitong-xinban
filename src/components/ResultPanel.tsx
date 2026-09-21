import type { GenerationItem, Platform } from "../types";
import { getPlatform } from "../lib/platforms";
import {
  SKIPPED_THREE_PIECE_MESSAGE,
  formatThreePieceSelection,
  type ThreePieceSelection,
} from "../lib/three-piece-selection";
import BatchDownloadButton from "./BatchDownloadButton";
import GenerationResultTile from "./GenerationResultTile";
import MerchantCopyCard from "./MerchantCopyCard";

const THREE_PIECE_COPY_TEXT =
  "老板您好，您的大店招、海报和头像设计已经完成。这套设计经过多家店铺测试，点击率和转化率都有显著提升，目的是提高您店铺的曝光度和入店转化率。我现在给您上线，您可以看看效果。";

interface Props {
  shopName: string;
  avatar: GenerationItem;
  storefront: GenerationItem;
  poster: GenerationItem;
  selectedKinds: ThreePieceSelection;
  onRetry: (kind: "avatar" | "storefront" | "poster") => void;
  onDownload: (kind: "avatar" | "storefront" | "poster", platform: Platform) => void;
  onBatchDownload: (platform: Platform) => void;
  canBatchDownload: boolean;
}

export default function ResultPanel({
  shopName,
  avatar,
  storefront,
  poster,
  selectedKinds,
  onRetry,
  onDownload,
  onBatchDownload,
  canBatchDownload,
}: Props) {
  const meituan = getPlatform("meituan");
  const taobao = getPlatform("taobao");
  const selectedLabel = formatThreePieceSelection(selectedKinds);
  const copyText = getThreePieceCopyText(selectedLabel);

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
          </span>
        </div>
        <div className="results__download-actions">
          <BatchDownloadButton
            label="批量下载美团尺寸"
            meta={selectedLabel}
            onClick={() => onBatchDownload("meituan")}
            disabled={!canBatchDownload}
            title={`按美团尺寸批量下载${selectedLabel}`}
          />
          <BatchDownloadButton
            label="批量下载淘宝闪购尺寸"
            meta={selectedLabel}
            onClick={() => onBatchDownload("taobao")}
            disabled={!canBatchDownload}
            title={`按淘宝闪购尺寸批量下载${selectedLabel}`}
          />
        </div>
      </div>
      <div className="results">
        <GenerationResultTile
          title="店铺头像"
          sub="原图 1024×1024"
          item={avatar}
          exportSize={`美团 ${meituan.avatar.w}×${meituan.avatar.h} / 淘宝闪购 ${taobao.avatar.w}×${taobao.avatar.h}`}
          idleMessage={selectedKinds.avatar ? "填写店铺信息后点击「开始生成」，将先行产出头像" : SKIPPED_THREE_PIECE_MESSAGE}
          actionsDisabled={!selectedKinds.avatar}
          onRetry={() => onRetry("avatar")}
          onDownload={() => onDownload("avatar", "meituan")}
          downloadOptions={[
            {
              label: "下载美团尺寸",
              meta: `${meituan.avatar.w}×${meituan.avatar.h}`,
              onClick: () => onDownload("avatar", "meituan"),
            },
            {
              label: "下载淘宝闪购尺寸",
              meta: `${taobao.avatar.w}×${taobao.avatar.h}`,
              onClick: () => onDownload("avatar", "taobao"),
            },
          ]}
        />
        <GenerationResultTile
          title="店招宣传图"
          sub="原图 1792×1024"
          item={storefront}
          exportSize={`美团 ${meituan.storefront.w}×${meituan.storefront.h} / 淘宝闪购 ${taobao.storefront.w}×${taobao.storefront.h}`}
          idleMessage={selectedKinds.storefront ? "将参考上传产品图自动生成店招" : SKIPPED_THREE_PIECE_MESSAGE}
          actionsDisabled={!selectedKinds.storefront}
          onRetry={() => onRetry("storefront")}
          onDownload={() => onDownload("storefront", "meituan")}
          downloadOptions={[
            {
              label: "下载美团尺寸",
              meta: `${meituan.storefront.w}×${meituan.storefront.h}`,
              onClick: () => onDownload("storefront", "meituan"),
            },
            {
              label: "下载淘宝闪购尺寸",
              meta: `${taobao.storefront.w}×${taobao.storefront.h}`,
              onClick: () => onDownload("storefront", "taobao"),
            },
          ]}
        />
        <GenerationResultTile
          title="海报图"
          sub={`原图 ${meituan.poster.sourceLabel} 横版`}
          item={poster}
          exportSize={`美团 ${meituan.poster.export.w}×${meituan.poster.export.h} / 淘宝闪购 ${taobao.poster.export.w}×${taobao.poster.export.h}`}
          idleMessage={selectedKinds.poster ? "将参考上传产品图自动生成海报" : SKIPPED_THREE_PIECE_MESSAGE}
          actionsDisabled={!selectedKinds.poster}
          onRetry={() => onRetry("poster")}
          onDownload={() => onDownload("poster", "meituan")}
          downloadOptions={[
            {
              label: "下载美团尺寸",
              meta: `${meituan.poster.export.w}×${meituan.poster.export.h}`,
              onClick: () => onDownload("poster", "meituan"),
            },
            {
              label: "下载淘宝闪购尺寸",
              meta: `${taobao.poster.export.w}×${taobao.poster.export.h}`,
              onClick: () => onDownload("poster", "taobao"),
            },
          ]}
        />
      </div>
      <MerchantCopyCard text={copyText} successMessage="三件套设计沟通文案已复制到剪贴板" />
    </div>
  );
}

function getThreePieceCopyText(selectedLabel: string) {
  if (selectedLabel === "头像、店招与海报") return THREE_PIECE_COPY_TEXT;
  return `老板您好，您的${selectedLabel}设计已经完成。这次先给您上线本次需要的图片，目的是提高您店铺的曝光度和入店转化率。我现在给您上线，您可以看看效果。`;
}
