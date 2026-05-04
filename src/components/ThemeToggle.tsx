import type { Theme } from "../lib/theme";
import { IconMonitor, IconMoon, IconSun } from "./Icons";

interface Props {
  theme: Theme;
  onChange: (next: Theme) => void;
}

const OPTIONS: Array<{ key: Theme; label: string; icon: React.ReactNode }> = [
  { key: "light", label: "浅色", icon: <IconSun style={{ width: 13, height: 13 }} /> },
  { key: "dark", label: "深色", icon: <IconMoon style={{ width: 13, height: 13 }} /> },
  { key: "system", label: "跟随系统", icon: <IconMonitor style={{ width: 13, height: 13 }} /> },
];

export default function ThemeToggle({ theme, onChange }: Props) {
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="主题">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="radio"
          aria-checked={theme === opt.key}
          className="theme-toggle__item"
          data-active={theme === opt.key}
          onClick={() => onChange(opt.key)}
          title={opt.label}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
