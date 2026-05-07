import { IconBatchImages, IconDesignSuite, IconHistory, IconImage, IconSettings, IconShield, IconStore } from "./Icons";
import type { WorkspaceTab } from "../hooks/useGenerationWorkspace";

interface SidebarProps {
  active: WorkspaceTab;
  onChange: (key: WorkspaceTab) => void;
  isAdmin: boolean;
  displayName: string;
  email?: string;
  onSignOut: () => void;
}

export default function Sidebar({
  active,
  onChange,
  isAdmin,
  displayName,
  email,
  onSignOut,
}: SidebarProps) {
  const items: Array<{
    key: WorkspaceTab;
    label: string;
    icon: React.ReactNode;
    desc: string;
    adminOnly?: boolean;
  }> = [
    {
      key: "avatarStorefront",
      label: "三件套设计",
      icon: <IconDesignSuite />,
      desc: "头像 / 店招 / 海报",
    },
    {
      key: "productImage",
      label: "制作1张设计图",
      icon: <IconImage />,
      desc: "单张高质感产品主图",
    },
    {
      key: "productBatch",
      label: "制作全店图",
      icon: <IconBatchImages />,
      desc: "最多 10 张批量全店图",
    },
    {
      key: "pictureWall",
      label: "图片墙生成",
      icon: <IconImage />,
      desc: "3 张美团图片墙",
    },
    {
      key: "pSignboard",
      label: "P门头",
      icon: <IconStore />,
      desc: "门头招牌文字替换",
    },
    {
      key: "imageEdit",
      label: "修改图片",
      icon: <IconSettings />,
      desc: "头像 / 店招 / 海报 / 产品图修改",
    },
    {
      key: "detailPage",
      label: "详情页生成",
      icon: <IconBatchImages />,
      desc: "3 张电商详情页展示图",
    },
    {
      key: "history",
      label: "历史记录",
      icon: <IconHistory />,
      desc: "最近生成的 OSS 图片",
    },
    {
      key: "admin",
      label: "后台管理",
      icon: <IconShield />,
      desc: "账号 / 生图统计 / OSS 历史",
      adminOnly: true,
    },
  ];

  const visibleItems = items.filter((it) => !it.adminOnly || isAdmin);

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
      {visibleItems.map((it) => (
        <button
          key={it.key}
          className="sidebar__nav-item"
          data-active={active === it.key}
          onClick={() => onChange(it.key)}
          title={it.desc}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}

      <div className="sidebar__section">支持平台</div>
      <div className="sidebar__chip" aria-hidden="true">
        <IconStore />
        <span>美团 · 淘宝闪购</span>
      </div>

      <div className="sidebar__bottom">
        <div className="sidebar__user">
          <div className="sidebar__user-info">
            <strong>{displayName}</strong>
            {email && <span>{email}</span>}
            {isAdmin && <span className="badge" data-tone="warn">管理员</span>}
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onSignOut}>
            退出登录
          </button>
        </div>

        <div className="sidebar__footer">
          <code>v2.0.0</code>
          <span>呈尚策划运营部</span>
        </div>
      </div>
    </aside>
  );
}
