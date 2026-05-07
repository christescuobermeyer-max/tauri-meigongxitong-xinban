import "../styles/user-status-card.css";

type UserStatusTheme = "light" | "dark";

interface UserStatusCardProps {
  displayName: string;
  isAdmin: boolean;
  theme: UserStatusTheme;
  onSignOut: () => void;
}

function UCShield({ idSuffix }: { idSuffix: string }) {
  const gradientId = `ucShieldG-${idSuffix}`;

  return (
    <svg viewBox="0 0 16 16" className="uc-badge-shield" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fcc66a" />
          <stop offset="1" stopColor="#e89a18" />
        </linearGradient>
      </defs>
      <path
        d="M8 1.4 L13.4 3.2 V8.2 C13.4 11.5 10.9 13.6 8 14.6 C5.1 13.6 2.6 11.5 2.6 8.2 V3.2 Z"
        fill={`url(#${gradientId})`}
        stroke="#c98414"
        strokeWidth="0.6"
      />
      <path
        d="M8 4.6 L8.85 6.4 L10.8 6.65 L9.4 8.0 L9.75 9.95 L8 9.05 L6.25 9.95 L6.6 8.0 L5.2 6.65 L7.15 6.4 Z"
        fill="#fff8e2"
      />
    </svg>
  );
}

function UCSpark() {
  return (
    <svg viewBox="0 0 16 16" className="uc-spark" aria-hidden="true">
      <path
        d="M8 0.8 L9.4 6.6 L15.2 8 L9.4 9.4 L8 15.2 L6.6 9.4 L0.8 8 L6.6 6.6 Z"
        fill="#f5b94a"
      />
    </svg>
  );
}

function UCArc() {
  return (
    <svg viewBox="0 0 200 200" className="uc-arc" aria-hidden="true">
      <path
        d="M 18 110 A 110 110 0 0 1 175 18"
        fill="none"
        stroke="#f6c9b6"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function UCLogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="uc-logout-icon"
      aria-hidden="true"
    >
      <path d="M9 4 H6 a2 2 0 0 0 -2 2 v12 a2 2 0 0 0 2 2 h3" />
      <path d="M16 17 l5 -5 -5 -5" />
      <path d="M21 12 H10" />
    </svg>
  );
}

function UCAvatar() {
  return (
    <div className="uc-avatar-wrap" aria-hidden="true">
      <div className="uc-avatar">
        <img src="/user-card-dog-avatar.svg" alt="" />
      </div>
    </div>
  );
}

export default function UserStatusCard({
  displayName,
  isAdmin,
  theme,
  onSignOut,
}: UserStatusCardProps) {
  const role = isAdmin ? "管理员" : "员工账号";

  return (
    <div className={`uc ${theme === "dark" ? "is-dark" : "is-light"}`}>
      <div className="uc-cover">
        <UCArc />
        <div className="uc-orb" />
        <div className="uc-dots" />
        <div className="uc-blue-dot" />
        <div className="uc-green-tri" />
        <UCAvatar />
        <div className="uc-identity">
          <div className="uc-name-row">
            <span className="uc-name" title={displayName}>{displayName}</span>
            <UCSpark />
          </div>
          <span className="uc-badge">
            <UCShield idSuffix={theme} />
            {role}
          </span>
        </div>
      </div>
      <hr className="uc-divider" />
      <div className="uc-foot">
        <button type="button" className="uc-logout" onClick={onSignOut}>
          <UCLogoutIcon />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  );
}
