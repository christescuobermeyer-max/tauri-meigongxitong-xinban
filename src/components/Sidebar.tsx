import { IconBatchImages, IconDesignSuite, IconHistory, IconImage, IconMonitor, IconSettings, IconShield, IconSparkles, IconStore, IconVideo } from "./Icons";
import type { ComponentType } from "react";
import { listWorkspaceNavigation, type WorkspaceIconId, type WorkspaceTab } from "../lib/workspace-catalog";
import UserStatusCard from "./UserStatusCard";

interface SidebarProps {
  active: WorkspaceTab;
  onChange: (key: WorkspaceTab) => void;
  isAdmin: boolean;
  displayName: string;
  theme: "light" | "dark";
  onSignOut: () => void;
}

const WORKSPACE_ICONS: Record<WorkspaceIconId, ComponentType> = {
  designSuite: IconDesignSuite,
  image: IconImage,
  batchImages: IconBatchImages,
  video: IconVideo,
  settings: IconSettings,
  sparkles: IconSparkles,
  history: IconHistory,
  monitor: IconMonitor,
  shield: IconShield,
  store: IconStore,
};

export default function Sidebar({
  active,
  onChange,
  isAdmin,
  displayName,
  theme,
  onSignOut,
}: SidebarProps) {
  const visibleItems = listWorkspaceNavigation(isAdmin);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo" aria-hidden="true">
          <img src="/brand-logo.png" alt="" />
        </div>
        <div className="sidebar__title">
          <span className="sidebar__title-main">呈尚策划</span>
          <span className="sidebar__title-sub">美工生图系统PRO</span>
        </div>
      </div>

      <div className="sidebar__section">工作区</div>
      {visibleItems.map((it) => {
        const Icon = WORKSPACE_ICONS[it.icon];
        return (
          <button
            key={it.key}
            className="sidebar__nav-item"
            data-active={active === it.key}
            onClick={() => onChange(it.key)}
            title={it.description}
          >
            <Icon />
            <span>{it.label}</span>
          </button>
        );
      })}

      <div className="sidebar__section">支持平台</div>
      <div className="sidebar__chip" aria-hidden="true">
        <IconStore />
        <span>美团 · 淘宝闪购</span>
      </div>

      <div className="sidebar__bottom">
        <UserStatusCard
          displayName={displayName}
          isAdmin={isAdmin}
          theme={theme}
          onSignOut={onSignOut}
        />

        <div className="sidebar__footer">
          <code>v3.0.52</code>
          <span>呈尚策划运营部</span>
        </div>
      </div>
    </aside>
  );
}
