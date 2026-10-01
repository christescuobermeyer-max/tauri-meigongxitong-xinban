type WorkspaceDefinition = {
  title: string;
  label: string;
  description: string;
  icon: "designSuite" | "image" | "batchImages" | "video" | "settings" | "sparkles" | "history" | "monitor" | "shield" | "store";
  adminOnly?: boolean;
  sidebarVisible?: boolean;
};

export const WORKSPACE_CATALOG = {
  avatarStorefront: { title: "三件套设计", label: "三件套设计", description: "头像 / 店招 / 海报", icon: "designSuite" },
  productImage: { title: "制作1张设计图", label: "制作1张设计图", description: "单张高质感产品主图", icon: "image" },
  productBatch: { title: "制作全店图", label: "制作全店图", description: "最多 20 张批量全店图", icon: "batchImages" },
  packageImage: { title: "制作套餐图", label: "制作套餐图", description: "最多 6 张产品合成套餐图", icon: "batchImages" },
  pictureWall: { title: "图片墙生成", label: "图片墙生成", description: "1-3 张美团图片墙", icon: "image" },
  pSignboard: { title: "P门头", label: "P门头", description: "门头招牌文字替换", icon: "store", sidebarVisible: false },
  videoSignboard: { title: "视频店招", label: "视频店招", description: "外卖视频裁剪导出", icon: "video" },
  imageEdit: { title: "修改图片", label: "修改图片", description: "单张 / 批量逐张修改图片", icon: "settings" },
  detailPage: { title: "详情页生成", label: "详情页生成", description: "3 张电商详情页展示图", icon: "batchImages" },
  brandStory: { title: "品牌故事", label: "品牌故事", description: "店铺品牌文案 + 5 张配图", icon: "sparkles" },
  menuDesign: { title: "菜单设计", label: "菜单设计", description: "文字 / 截图整理与菜单设计", icon: "designSuite" },
  dataAnalysis: { title: "数据分析", label: "数据分析", description: "截图生成专业数据分析图", icon: "image" },
  imageResize: { title: "尺寸调整", label: "尺寸调整", description: "批量调整美团 / 饿了么产品图尺寸", icon: "settings" },
  history: { title: "历史记录", label: "历史记录", description: "最近生成的 OSS 图片", icon: "history" },
  gatewayMonitor: { title: "实时监控", label: "实时监控", description: "网关并发 / 线路健康 / 排队情况", icon: "monitor" },
  imagePlaza: { title: "图片广场", label: "图片广场", description: "所有账号最新生图只读预览", icon: "batchImages" },
  admin: { title: "后台管理", label: "后台管理", description: "账号 / 生图统计 / OSS 历史", icon: "shield", adminOnly: true },
} as const satisfies Record<string, WorkspaceDefinition>;

export type WorkspaceTab = keyof typeof WORKSPACE_CATALOG;
export type WorkspaceIconId = (typeof WORKSPACE_CATALOG)[WorkspaceTab]["icon"];

export function getWorkspaceTitle(tab: WorkspaceTab): string {
  return WORKSPACE_CATALOG[tab].title;
}

export function listWorkspaceNavigation(isAdmin: boolean) {
  return (Object.entries(WORKSPACE_CATALOG) as [WorkspaceTab, WorkspaceDefinition][])
    .filter(([, item]) => item.sidebarVisible !== false && (!item.adminOnly || isAdmin))
    .map(([key, item]) => ({
      key,
      label: item.label,
      description: item.description,
      icon: item.icon,
    }));
}
