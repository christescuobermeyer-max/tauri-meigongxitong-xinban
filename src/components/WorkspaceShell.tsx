import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TopBarStatus from "./TopBarStatus";
import WorkspacePages from "./WorkspacePages";
import useGenerationWorkspace from "../hooks/useGenerationWorkspace";
import { getWorkspaceTitle } from "../lib/workspace-catalog";
import { useTheme } from "../hooks/useTheme";
import type { ProfileRow } from "../lib/supabase";
import type { ResolvedTheme, Theme } from "../lib/theme";

interface Props {
  profile: ProfileRow;
  isAdmin: boolean;
  onSignOut: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export default function WorkspaceShell({ profile, isAdmin, onSignOut, onBusyChange }: Props) {
  const [workspaceResetKey, setWorkspaceResetKey] = useState(0);
  const { theme, resolved, setTheme } = useTheme();

  return (
    <WorkspaceRuntime
      key={`${profile.id}-${workspaceResetKey}`}
      profile={profile}
      isAdmin={isAdmin}
      onSignOut={onSignOut}
      onBusyChange={onBusyChange}
      theme={theme}
      resolvedTheme={resolved}
      onThemeChange={setTheme}
      onResetWorkspace={() => setWorkspaceResetKey((current) => current + 1)}
    />
  );
}

interface WorkspaceRuntimeProps extends Props {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  onThemeChange: (theme: Theme) => void;
  onResetWorkspace: () => void;
}

function WorkspaceRuntime({
  profile,
  isAdmin,
  onSignOut,
  onBusyChange,
  theme,
  resolvedTheme,
  onThemeChange,
  onResetWorkspace,
}: WorkspaceRuntimeProps) {
  const workspace = useGenerationWorkspace({ userId: profile.id });

  useEffect(() => {
    onBusyChange?.(workspace.busy);
  }, [onBusyChange, workspace.busy]);

  useEffect(() => {
    return () => onBusyChange?.(false);
  }, [onBusyChange]);

  const handleRefreshAll = () => {
    if (workspace.busy) {
      window.alert("当前仍在生成中，请等待任务结束后再刷新，避免丢失未下载图片。");
      return;
    }

    const confirmed = window.confirm(
      "谨慎使用：刷新会清空所有工具板块中已填写的输入框、上传的图片和当前未下载的生成结果。刷新前请先下载所有需要保留的图片。确定继续吗？"
    );
    if (!confirmed) return;

    onResetWorkspace();
  };

  const title = getWorkspaceTitle(workspace.tab);

  return (
    <div className="app-shell">
      <Sidebar
        active={workspace.tab}
        onChange={workspace.setTab}
        isAdmin={isAdmin}
        displayName={profile.display_name}
        theme={resolvedTheme}
        onSignOut={onSignOut}
        />
      <main className="main">
        <TopBar
          title={title}
          crumbs={["呈尚策划", "图像生成系统"]}
          rightSlot={
            <TopBarStatus
              todayCount={workspace.todayCount}
              totalCount={workspace.totalCount}
              globalTotalCount={workspace.globalTotalCount}
              busy={workspace.busy}
              theme={theme}
              onThemeChange={onThemeChange}
              onRefreshAll={handleRefreshAll}
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
