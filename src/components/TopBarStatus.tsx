import ThemeToggle from "./ThemeToggle";
import type { Theme } from "../lib/theme";

interface Props {
  todayCount: number;
  totalCount: number;
  busy: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export default function TopBarStatus({
  todayCount,
  totalCount,
  busy,
  theme,
  onThemeChange,
}: Props) {
  return (
    <>
      <span
        className="badge topbar-line-badge"
        data-tone="info"
        title="云端网关会按线路状态和并发自动分配"
      >
        自动分配线路
      </span>
      <span className="badge" data-tone="accent" title="该账号累计成功归档到 OSS 的图片数">
        总生图 <strong style={{ marginLeft: 4 }}>{totalCount}</strong> 张
      </span>
      <span className="badge" data-tone="info" title="今日已成功归档到 OSS 的图片数">
        今日已生图 <strong style={{ marginLeft: 4 }}>{todayCount}</strong> 张
      </span>
      <span className="badge" data-tone={busy ? "info" : "success"}>
        <span className={busy ? "dot dot--pulse" : "dot"} />
        {busy ? "生成中" : "就绪"}
      </span>
      <ThemeToggle theme={theme} onChange={onThemeChange} />
    </>
  );
}
