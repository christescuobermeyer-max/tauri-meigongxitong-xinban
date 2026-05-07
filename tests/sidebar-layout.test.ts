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
const dogAvatarPath = fileURLToPath(new URL("../public/user-card-dog-avatar.svg", import.meta.url));

equal(source.includes('<div className="sidebar__bottom">'), true);
equal(source.includes('label: "三件套设计"'), true);
equal(source.includes('label: "头像店招"'), false);
equal(
  source.includes('<div className="sidebar__bottom">\n        <UserStatusCard'),
  true
);
equal(source.includes('import UserStatusCard from "./UserStatusCard";'), true);
equal(source.includes("theme={theme}"), true);
equal(
  source.includes('<div className="sidebar__footer">\n          <code>v2.0.0</code>\n          <span>呈尚策划运营部</span>\n        </div>\n      </div>'),
  true
);
equal(workspaceSource.includes('? "三件套设计"'), true);
equal(workspaceSource.includes('? "头像店招"'), false);
equal(workspaceSource.includes("const { theme, resolved, setTheme } = useTheme();"), true);
equal(workspaceSource.includes("theme={resolved}"), true);
equal(userCardSource.includes('className="uc-cover"'), true);
equal(userCardSource.includes('src="/user-card-dog-avatar.svg"'), true);
equal(existsSync(dogAvatarPath), true);
equal(userCardSource.includes("退出登录"), true);
equal(userCardStyles.includes(".uc.is-light .uc-cover"), true);
equal(userCardStyles.includes(".uc.is-dark .uc-cover"), true);
