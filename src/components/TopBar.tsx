import { IconRefresh } from "./Icons";

interface TopBarProps {
  title: string;
  crumbs?: string[];
  rightSlot?: React.ReactNode;
  onRefresh?: () => void;
}

export default function TopBar({ title, crumbs = [], rightSlot, onRefresh }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__title">{title}</div>
        {crumbs.length > 0 && (
          <div className="topbar__crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="divider">/</span>}
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="topbar__right">
        {onRefresh && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={onRefresh}
            title="清空所有工具状态"
            type="button"
          >
            <IconRefresh style={{ width: 13, height: 13 }} />
            刷新
          </button>
        )}
        {rightSlot}
      </div>
    </header>
  );
}
