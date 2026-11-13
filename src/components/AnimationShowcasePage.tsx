import { useEffect, useRef, useState } from "react";
import { ANIMATION_SHOWCASE_MAX_PAGES, downloadShowcaseItem, fetchAnimationShowcase, type AnimationShowcaseItem, type AnimationShowcasePage as ShowcaseData } from "../lib/animation-showcase";
import { IconDownload, IconRefresh } from "./Icons";
import "../styles/animation-showcase.css";

export default function AnimationShowcasePage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<AnimationShowcaseItem | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function download(item: AnimationShowcaseItem) {
    if (downloading) return;
    setDownloading(item.id);setNotice(null);
    try {
      if (await downloadShowcaseItem(item)) setNotice({ tone: "ok", text: `已保存：${item.title}` });
    } catch (reason) {
      setNotice({ tone: "error", text: `下载失败：${reason instanceof Error ? reason.message : String(reason)}` });
    } finally {
      setDownloading(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAnimationShowcase(page)
      .then((next) => { if (cancelled) return;setData(next);setError(null);if (next.page !== page) setPage(next.page); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, reloadTick]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const pageCount = data?.pageCount ?? 1;
  return <section className="card image-plaza animation-showcase">
    <div className="card__header image-plaza__header">
      <div className="card__heading">
        <div className="card__title">动图展示</div>
        <span className="card__hint">所有账号最新的视频转动图 · 自动播放 · 可下载</span>
      </div>
      <button className="btn btn--ghost btn--sm" type="button" onClick={() => setReloadTick((tick) => tick + 1)} disabled={loading}>
        <IconRefresh style={{ width: 13, height: 13 }} />刷新
      </button>
    </div>
    <div className="card__body image-plaza__body">
      <div className="image-plaza__summary">
        <span>{data ? `可查看 ${data.visibleTotalCount} 个动图 · 第 ${data.page} / ${pageCount} 页` : `最多展示 ${ANIMATION_SHOWCASE_MAX_PAGES} 页`}</span>
        <span>在“动图制作 → 视频转动图”生成后自动出现在这里</span>
      </div>
      {error ? <div className="empty empty--inline image-plaza__error">{error}</div> : null}
      {notice ? <p className={`animation-showcase__notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p> : null}
      {loading && !data ? <div className="empty empty--inline">正在加载动图展示…</div> : null}
      {data && data.items.length === 0 && !loading ? <div className="empty empty--inline">还没有视频转动图作品</div> : null}
      {data && data.items.length > 0 ? <div className="image-plaza__grid animation-showcase__grid" aria-busy={loading ? "true" : undefined}>
        {data.items.map((item) => <ShowcaseCard key={item.id} item={item} onPreview={setLightbox} onDownload={download} downloading={downloading === item.id} busy={downloading !== null} />)}
      </div> : null}
      {data && data.visibleTotalCount > data.pageSize ? <div className="admin__pagination image-plaza__pagination">
        <span className="admin__pagination-info">共 {data.visibleTotalCount} 个可查看 · 第 {data.page} / {pageCount} 页</span>
        <div className="admin__pagination-actions">
          <button className="btn btn--ghost btn--sm" type="button" disabled={data.page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹ 上一页</button>
          <button className="btn btn--ghost btn--sm" type="button" disabled={data.page >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>下一页 ›</button>
        </div>
      </div> : null}
    </div>
    {lightbox ? <div className="admin__log-lightbox image-plaza__lightbox" role="dialog" aria-modal="true" aria-label="动图大图" onClick={() => setLightbox(null)} onContextMenu={(event) => event.preventDefault()}>
      <img className="admin__log-lightbox-image image-plaza__lightbox-image" src={lightbox.url} alt={lightbox.title} draggable={false} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()} />
      <div className="image-plaza__lightbox-meta" onClick={(event) => event.stopPropagation()}><strong>{lightbox.title}</strong><span>{lightbox.displayName} · {lightbox.width}×{lightbox.height} · {(lightbox.durationMs / 1000).toFixed(1)} 秒</span>
        <button type="button" className="btn btn--primary btn--sm" disabled={downloading !== null} onClick={() => void download(lightbox)}><IconDownload width={13} height={13} aria-hidden="true" />{downloading === lightbox.id ? "下载中…" : `下载 ${lightbox.format.toUpperCase()}`}</button></div>
      <button className="admin__log-lightbox-close" type="button" aria-label="关闭" onClick={() => setLightbox(null)}>×</button>
    </div> : null}
  </section>;
}

/** Plays the animation only while the card is on screen; off screen it shows the still poster. */
function ShowcaseCard({ item, onPreview, onDownload, downloading, busy }: { item: AnimationShowcaseItem; onPreview: (item: AnimationShowcaseItem) => void; onDownload: (item: AnimationShowcaseItem) => void; downloading: boolean; busy: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true);return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return <article className="image-plaza__card animation-showcase__card">
    <button ref={ref} type="button" className="image-plaza__thumb animation-showcase__thumb"
      onClick={() => onPreview(item)} onContextMenu={(event) => event.preventDefault()} aria-label={`放大查看：${item.title}`}>
      <img src={visible ? item.url : item.posterUrl} alt={item.title} data-playing={visible ? "true" : "false"} decoding="async" draggable={false} onContextMenu={(event) => event.preventDefault()} />
      <span className="animation-showcase__tag">{item.format.toUpperCase()} · {(item.durationMs / 1000).toFixed(1)}秒</span>
    </button>
    <div className="image-plaza__meta">
      <div className="image-plaza__badges">
        <span className="badge">{item.displayName}</span>
        <span className="badge" data-tone="info">视频动图</span>
      </div>
      <strong className="image-plaza__shop" title={item.title}>{item.title}</strong>
      <div className="image-plaza__foot"><span>{formatShortDateTime(item.createdAt)}</span><span>{item.width}×{item.height} · {(item.bytes / 1_000_000).toFixed(2)}MB</span></div>
      <button type="button" className="btn btn--secondary btn--sm animation-showcase__download" disabled={busy} onClick={() => onDownload(item)} aria-label={`下载：${item.title}`}>
        <IconDownload width={13} height={13} aria-hidden="true" />{downloading ? "下载中…" : `下载 ${item.format.toUpperCase()}`}
      </button>
    </div>
  </article>;
}

function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
