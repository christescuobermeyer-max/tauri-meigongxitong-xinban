import { equal } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(
  new URL("../src/components/WorkspaceShell.tsx", import.meta.url),
  "utf8"
);
const userCardSource = readFileSync(
  new URL("../src/components/UserStatusCard.tsx", import.meta.url),
  "utf8"
);
const userCardStyles = readFileSync(
  new URL("../src/styles/user-status-card.css", import.meta.url),
  "utf8"
);
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { version?: string };
const tauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")
) as { version?: string };
const cargoToml = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const dogAvatarPath = fileURLToPath(new URL("../public/user-card-dog-avatar.svg", import.meta.url));

equal(source.includes('<div className="sidebar__bottom">'), true);
equal(source.includes('label: "三件套设计"'), true);
equal(source.includes('label: "头像店招"'), false);
equal(
  source.includes("<UserStatusCard"),
  true
);
equal(source.includes('import UserStatusCard from "./UserStatusCard";'), true);
equal(source.includes("theme={theme}"), true);
equal(
  source.includes("<code>v2.0.0</code>"),
  false
);
equal(
  source.includes("<code>v3.0.0</code>"),
  false
);
equal(
  source.includes("<code>v3.0.1</code>"),
  false
);
equal(
  source.includes("<code>v3.0.2</code>"),
  false
);
equal(
  source.includes("<code>v3.0.3</code>"),
  false
);
equal(
  source.includes("<code>v3.0.4</code>"),
  false
);
equal(
  source.includes("<code>v3.0.5</code>"),
  false
);
equal(
  source.includes("<code>v3.0.6</code>"),
  false
);
equal(
  source.includes("<code>v3.0.8</code>"),
  false
);
equal(
  source.includes("<code>v3.0.9</code>"),
  false
);
equal(
  source.includes("<code>v3.0.12</code>"),
  false
);
equal(
  source.includes("<code>v3.0.13</code>"),
  false
);
equal(
  source.includes("<code>v3.0.18</code>"),
  false
);
equal(
  source.includes("<code>v3.0.20</code>"),
  false
);
equal(
  source.includes("<code>v3.0.21</code>"),
  false
);
equal(
  source.includes("<code>v3.0.26</code>"),
  false
);
equal(
  source.includes("<code>v3.0.30</code>"),
  true
);
equal(packageJson.version, "3.0.30");
equal(tauriConfig.version, "3.0.30");
equal(cargoToml.includes('version = "3.0.30"'), true);
equal(source.includes('label: "巡店话术"'), false);
equal(source.includes("patrolScript"), false);
equal(source.includes("disabled: true"), false);
equal(source.includes("disabled={it.disabled}"), false);
equal(source.includes("if (it.disabled) return;"), false);
equal(workspaceSource.includes('? "三件套设计"'), true);
equal(workspaceSource.includes('? "头像店招"'), false);
equal(workspaceSource.includes("const { theme, resolved, setTheme } = useTheme();"), true);
equal(workspaceSource.includes("theme={resolvedTheme}"), true);
equal(userCardSource.includes('className="uc-cover"'), true);
equal(userCardSource.includes('src="/user-card-dog-avatar.svg"'), true);
equal(existsSync(dogAvatarPath), true);
equal(userCardSource.includes("退出登录"), true);
equal(userCardStyles.includes(".uc.is-light .uc-cover"), true);
equal(userCardStyles.includes(".uc.is-dark .uc-cover"), true);
