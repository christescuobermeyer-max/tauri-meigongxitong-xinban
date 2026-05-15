import { IconBatchImages, IconDesignSuite, IconHistory, IconImage, IconSettings, IconShield, IconSparkles, IconStore } from "./Icons";
import UserStatusCard from "./UserStatusCard";
import type { WorkspaceTab } from "../hooks/useGenerationWorkspace";

interface SidebarProps {
  active: WorkspaceTab;
  onChange: (key: WorkspaceTab) => void;
  isAdmin: boolean;
  displayName: string;
  theme: "light" | "dark";
  onSignOut: () => void;
}

export default function Sidebar({
  active,
  onChange,
  isAdmin,
  displayName,
  theme,
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
      key: "packageImage",
      label: "制作套餐图",
      icon: <IconBatchImages />,
      desc: "最多 4 张产品合成套餐图",
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
      key: "brandStory",
      label: "品牌故事",
      icon: <IconSparkles />,
      desc: "店铺品牌文案 + 5 张配图",
    },
    {
      key: "dataAnalysis",
      label: "数据分析",
      icon: <IconImage />,
      desc: "截图生成专业数据分析图",
    },
    {
      key: "patrolScript",
      label: "巡店话术",
      icon: <IconBatchImages />,
      desc: "50 条话术 → 知识卡片图",
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
        <UserStatusCard
          displayName={displayName}
          isAdmin={isAdmin}
          theme={theme}
          onSignOut={onSignOut}
        />

        <div className="sidebar__footer">
          <code>v2.0.0</code>
          <span>呈尚策划运营部</span>
        </div>
      </div>
    </aside>
  );
}
