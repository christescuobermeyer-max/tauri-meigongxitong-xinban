import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TopBarStatus from "./TopBarStatus";
import WorkspacePages from "./WorkspacePages";
import useGenerationWorkspace from "../hooks/useGenerationWorkspace";
import { useTheme } from "../hooks/useTheme";
import type { ProfileRow } from "../lib/supabase";

interface Props {
  profile: ProfileRow;
  isAdmin: boolean;
  onSignOut: () => void;
}

export default function WorkspaceShell({ profile, isAdmin, onSignOut }: Props) {
  const workspace = useGenerationWorkspace({ userId: profile.id });
  const { theme, setTheme } = useTheme();

  const title =
    workspace.tab === "avatarStorefront"
      ? "三件套设计"
      : workspace.tab === "productImage"
        ? "制作1张设计图"
        : workspace.tab === "productBatch"
          ? "制作全店图"
          : workspace.tab === "pictureWall"
            ? "图片墙生成"
            : workspace.tab === "pSignboard"
              ? "P门头"
              : workspace.tab === "imageEdit"
                ? "修改图片"
                : workspace.tab === "history"
                  ? "历史记录"
                  : "后台管理";

  return (
    <div className="app-shell">
      <Sidebar
        active={workspace.tab}
        onChange={workspace.setTab}
        isAdmin={isAdmin}
        displayName={profile.display_name}
        onSignOut={onSignOut}
      />
      <main className="main">
        <TopBar
          title={title}
          crumbs={["呈尚策划", "图像生成系统"]}
          rightSlot={
            <TopBarStatus
              generationLine={workspace.generationLine}
              todayCount={workspace.todayCount}
              busy={workspace.busy}
              theme={theme}
              onThemeChange={setTheme}
            />
          }
        />
        <div className="main__scroll">
          <WorkspacePages workspace={workspace} />
        </div>
      </main>
    </div>
  );
}
