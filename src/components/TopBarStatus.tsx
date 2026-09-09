import ThemeToggle from "./ThemeToggle";
import type { Theme } from "../lib/theme";

interface Props {
  todayCount: number;
  totalCount: number;
  globalTotalCount: number;
  busy: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onRefreshAll: () => void;
}

export default function TopBarStatus({
  todayCount,
  totalCount,
  globalTotalCount,
  busy,
  theme,
  onThemeChange,
  onRefreshAll,
}: Props) {
  return (
    <>
      <span className="badge" data-tone="accent" title="所有账号累计成功归档到 OSS 的图片数">
        所有账号累计 <strong style={{ marginLeft: 4 }}>{globalTotalCount}</strong> 张
      </span>
      <span className="badge" data-tone="warn" title="当前账号累计成功归档到 OSS 的图片数">
        当前账号累计 <strong style={{ marginLeft: 4 }}>{totalCount}</strong> 张
      </span>
      <span className="badge" data-tone="info" title="今日已成功归档到 OSS 的图片数">
        今日已生图 <strong style={{ marginLeft: 4 }}>{todayCount}</strong> 张
      </span>
      <span className="badge" data-tone={busy ? "info" : "success"}>
        <span className={busy ? "dot dot--pulse" : "dot"} />
        {busy ? "生成中" : "就绪"}
      </span>
      <button
        className="btn btn--ghost btn--sm"
        type="button"
        onClick={onRefreshAll}
        disabled={busy}
        title="谨慎使用：刷新前请先下载所有图片"
        aria-label="谨慎刷新全部工具输入和上传图片"
      >
        谨慎刷新
      </button>
      <ThemeToggle theme={theme} onChange={onThemeChange} />
    </>
  );
}
