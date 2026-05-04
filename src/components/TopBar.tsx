interface TopBarProps {
  title: string;
  crumbs?: string[];
  rightSlot?: React.ReactNode;
}

export default function TopBar({ title, crumbs = [], rightSlot }: TopBarProps) {
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
      <div className="topbar__right">{rightSlot}</div>
    </header>
  );
}
