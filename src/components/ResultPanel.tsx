import type { GenerationItem, PlatformSpec } from "../types";
import { IconDownload } from "./Icons";
import GenerationResultTile from "./GenerationResultTile";

interface Props {
  platform: PlatformSpec;
  shopName: string;
  avatar: GenerationItem;
  storefront: GenerationItem;
  poster: GenerationItem;
  onRetry: (kind: "avatar" | "storefront" | "poster") => void;
  onDownload: (kind: "avatar" | "storefront" | "poster") => void;
  onBatchDownload: () => void;
  canBatchDownload: boolean;
}

export default function ResultPanel({
  platform,
  shopName,
  avatar,
  storefront,
  poster,
  onRetry,
  onDownload,
  onBatchDownload,
  canBatchDownload,
}: Props) {
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
              平台 <strong>{platform.label}</strong>
            </span>
          </span>
        </div>
        <button
          className="btn btn--secondary btn--sm"
          onClick={onBatchDownload}
          disabled={!canBatchDownload}
          title="批量下载头像、店招、海报"
        >
          <IconDownload style={{ width: 13, height: 13 }} />
          批量下载
        </button>
      </div>
      <div className="results">
        <GenerationResultTile
          title="店铺头像"
          sub="原图 1024×1024"
          item={avatar}
          exportSize={`${platform.avatar.w}×${platform.avatar.h}`}
          idleMessage="填写店铺信息后点击「开始生成」，将先行产出头像"
          onRetry={() => onRetry("avatar")}
          onDownload={() => onDownload("avatar")}
        />
        <GenerationResultTile
          title="店招宣传图"
          sub="原图 1536×1024"
          item={storefront}
          exportSize={`${platform.storefront.w}×${platform.storefront.h}`}
          idleMessage="头像生成完成后，将参考头像图自动生成店招"
          onRetry={() => onRetry("storefront")}
          onDownload={() => onDownload("storefront")}
        />
        <GenerationResultTile
          title="海报图"
          sub={`原图 ${platform.poster.sourceLabel} 横版`}
          item={poster}
          exportSize={`${platform.poster.export.w}×${platform.poster.export.h}`}
          idleMessage="店招生成完成后，将参考店招图自动生成海报"
          onRetry={() => onRetry("poster")}
          onDownload={() => onDownload("poster")}
        />
      </div>
    </div>
  );
}
