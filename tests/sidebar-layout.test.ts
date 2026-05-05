import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(
  new URL("../src/components/WorkspaceShell.tsx", import.meta.url),
  "utf8"
);

equal(source.includes('<div className="sidebar__bottom">'), true);
equal(source.includes('label: "三件套设计"'), true);
equal(source.includes('label: "头像店招"'), false);
equal(
  source.includes('<div className="sidebar__bottom">\n        <div className="sidebar__user">'),
  true
);
equal(
  source.includes('<div className="sidebar__footer">\n          <code>v2.0.0</code>\n          <span>呈尚策划运营部</span>\n        </div>\n      </div>'),
  true
);
equal(workspaceSource.includes('? "三件套设计"'), true);
equal(workspaceSource.includes('? "头像店招"'), false);
