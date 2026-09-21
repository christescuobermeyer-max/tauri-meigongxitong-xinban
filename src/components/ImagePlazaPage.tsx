import { useEffect, useState } from "react";
import { ASSET_LABEL, GENERATION_LINE_LABEL } from "../lib/admin-log-filters";
import {
  fetchImagePlazaPage,
  IMAGE_PLAZA_MAX_PAGES,
  type ImagePlazaItem,
  type ImagePlazaPage as ImagePlazaPageData,
} from "../lib/image-plaza";
import { IconRefresh } from "./Icons";

export default function ImagePlazaPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ImagePlazaPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImagePlazaItem | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchImagePlazaPage(page)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
        if (next.page !== page) setPage(next.page);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, reloadTick]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const pageCount = data?.pageCount ?? 1;
  const totalLabel = data
    ? `可查看 ${data.visibleTotalCount} 张 · 第 ${data.page} / ${pageCount} 页`
    : `最多展示 ${IMAGE_PLAZA_MAX_PAGES} 页`;

  return (
    <section className="card image-plaza">
      <div className="card__header image-plaza__header">
        <div className="card__heading">
          <div className="card__title">图片广场</div>
          <span className="card__hint">所有账号最新生图 · 只读预览 · 不展示链接</span>
        </div>
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          onClick={() => setReloadTick((tick) => tick + 1)}
          disabled={loading}
        >
          <IconRefresh style={{ width: 13, height: 13 }} />
          刷新
        </button>
      </div>

      <div className="card__body image-plaza__body">
        <div className="image-plaza__summary">
          <span>{totalLabel}</span>
          <span>最多开放前 {IMAGE_PLAZA_MAX_PAGES} 页</span>
        </div>

        {error ? (
          <div className="empty empty--inline image-plaza__error">{error}</div>
        ) : null}

        {loading && !data ? (
          <div className="empty empty--inline">正在加载图片广场…</div>
        ) : null}

        {data && data.items.length === 0 && !loading ? (
          <div className="empty empty--inline">暂无可展示的生图记录</div>
        ) : null}

        {data && data.items.length > 0 ? (
          <div className="image-plaza__grid" aria-busy={loading ? "true" : undefined}>
            {data.items.map((item) => (
              <ImagePlazaCard key={item.id} item={item} onPreview={setLightbox} />
            ))}
          </div>
        ) : null}

        {data && data.visibleTotalCount > data.pageSize ? (
          <div className="admin__pagination image-plaza__pagination">
            <span className="admin__pagination-info">
              共 {data.visibleTotalCount} 张可查看 · 第 {data.page} / {pageCount} 页
            </span>
            <div className="admin__pagination-actions">
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                disabled={data.page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                ‹ 上一页
              </button>
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                disabled={data.page >= pageCount || loading}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                下一页 ›
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {lightbox ? (
        <div
          className="admin__log-lightbox image-plaza__lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <img
            className="admin__log-lightbox-image image-plaza__lightbox-image"
            src={lightbox.imageUrl}
            alt={lightbox.shopName}
            draggable={false}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          />
          <div className="image-plaza__lightbox-meta">
            <strong>{lightbox.shopName}</strong>
            <span>{lightbox.displayName} · {ASSET_LABEL[lightbox.assetKind] ?? lightbox.assetKind}</span>
          </div>
          <button
            className="admin__log-lightbox-close"
            type="button"
            aria-label="关闭"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ImagePlazaCard({
  item,
  onPreview,
}: {
  item: ImagePlazaItem;
  onPreview: (item: ImagePlazaItem) => void;
}) {
  return (
    <article className="image-plaza__card">
      <button
        type="button"
        className="image-plaza__thumb"
        onClick={() => onPreview(item)}
        onContextMenu={(event) => event.preventDefault()}
        aria-label={`放大查看：${item.shopName}`}
      >
        <img
          src={item.imageUrl}
          alt={item.shopName}
          loading="lazy"
          draggable={false}
          onContextMenu={(event) => event.preventDefault()}
        />
      </button>
      <div className="image-plaza__meta">
        <div className="image-plaza__badges">
          <span className="badge" title={item.userId}>{item.displayName}</span>
          <span className="badge" data-tone="info">{ASSET_LABEL[item.assetKind] ?? item.assetKind}</span>
          <span className="badge">{item.platform === "meituan" ? "美团" : "淘宝闪购"}</span>
        </div>
        <strong className="image-plaza__shop">{item.shopName}</strong>
        {item.productName ? <span className="image-plaza__product">{item.productName}</span> : null}
        <div className="image-plaza__foot">
          <span>{formatShortDateTime(item.createdAt)}</span>
          <span>{formatGenerationLine(item)}</span>
        </div>
      </div>
    </article>
  );
}

function formatGenerationLine(item: ImagePlazaItem): string {
  if (item.generationLine) return GENERATION_LINE_LABEL[item.generationLine] ?? item.generationLine;
  return item.assetKind === "picture_wall" ? "专用接口" : "未知线路";
}

function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}
