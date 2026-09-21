import { equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const sidebarSource = read("src/components/Sidebar.tsx");
const workspaceHookSource = read("src/hooks/useGenerationWorkspace.ts");
const workspaceShellSource = read("src/components/WorkspaceShell.tsx");
const workspacePagesSource = read("src/components/WorkspacePages.tsx");
const imagePlazaSource = read("src/components/ImagePlazaPage.tsx");
const imagePlazaLibSource = read("src/lib/image-plaza.ts");
const gatewaySource = read("src-tauri/src/bin/backend_gateway.rs");
const stylesSource = read("src/styles/global.css");

equal(existsSync(fileURLToPath(new URL("../src/components/ImagePlazaPage.tsx", import.meta.url))), true);
equal(existsSync(fileURLToPath(new URL("../src/lib/image-plaza.ts", import.meta.url))), true);

const gatewayIndex = sidebarSource.indexOf('key: "gatewayMonitor"');
const plazaIndex = sidebarSource.indexOf('key: "imagePlaza"');
const adminIndex = sidebarSource.indexOf('key: "admin"');
ok(gatewayIndex > 0, "侧边栏应保留实时监控入口");
ok(plazaIndex > gatewayIndex, "图片广场应位于实时监控下方");
ok(adminIndex > plazaIndex, "图片广场应位于后台管理上方");
ok(sidebarSource.includes('label: "图片广场"'), "侧边栏应展示图片广场名称");
ok(sidebarSource.includes('desc: "所有账号最新生图只读预览"'), "侧边栏描述应说明只读预览");

ok(workspaceHookSource.includes('| "imagePlaza"'), "WorkspaceTab 应包含 imagePlaza");
ok(workspaceShellSource.includes('workspace.tab === "imagePlaza"'), "顶部标题应识别图片广场");
ok(workspaceShellSource.includes('? "图片广场"'), "顶部标题应显示图片广场");
ok(workspacePagesSource.includes('import ImagePlazaPage from "./ImagePlazaPage";'));
ok(workspacePagesSource.includes('workspace.tab === "imagePlaza"'));
ok(workspacePagesSource.includes('<ImagePlazaPage />'));

ok(imagePlazaLibSource.includes('IMAGE_PLAZA_MAX_PAGES = 10'), "图片广场最多只展示 10 页");
ok(imagePlazaLibSource.includes('/api/image-plaza'), "图片广场应读取网关接口");
ok(imagePlazaLibSource.includes('method: "GET"'), "图片广场应使用 GET 读取分页数据");
ok(imagePlazaLibSource.includes('Authorization: `Bearer ${token}`'), "图片广场接口应要求登录态");
equal(imagePlazaLibSource.includes('.from("generation_logs")'), false, "普通用户不能直接绕 RLS 读取所有账号明细");

ok(imagePlazaSource.includes('只读预览'), "页面应明确是只读预览");
ok(imagePlazaSource.includes('不展示链接'), "页面应明确不展示链接");
ok(imagePlazaSource.includes('onContextMenu={(event) => event.preventDefault()}'), "缩略图和大图应阻止右键菜单");
ok(imagePlazaSource.includes('draggable={false}'), "图片不应可直接拖拽保存");
ok(imagePlazaSource.includes('setLightbox'), "点击图片应支持放大查看");
equal(imagePlazaSource.includes('href={item.imageUrl}'), false, "图片广场不能把图片渲染成链接");
equal(imagePlazaSource.includes('download'), false, "图片广场不能提供下载入口");

ok(gatewaySource.includes('/api/image-plaza'), "网关应暴露图片广场接口");
ok(gatewaySource.includes('async fn image_plaza'), "网关应实现图片广场 handler");
const handlerMatch = gatewaySource.match(/async fn image_plaza[\s\S]*?async fn fetch_image_plaza_logs/);
ok(handlerMatch, "应能定位图片广场 handler");
const handlerSource = handlerMatch![0];
ok(handlerSource.includes('verify_access_token'), "图片广场应要求登录态");
ok(handlerSource.includes('service_role_bearer'), "图片广场应使用 service role 读取所有账号明细");
equal(handlerSource.includes('ensure_admin_profile'), false, "图片广场不应限制为管理员才能查看");
ok(gatewaySource.includes('IMAGE_PLAZA_PAGE_SIZE: usize = 30'), "网关每页应返回 30 张");
ok(gatewaySource.includes('IMAGE_PLAZA_MAX_PAGES: usize = 10'), "网关最多开放 10 页");
ok(gatewaySource.includes('select=id,user_id,shop_name,product_name,asset_kind,platform,generation_line,oss_url,created_at,elapsed_ms'), "网关应只读取展示所需字段");

ok(stylesSource.includes('.image-plaza__grid'), "图片广场应有网格样式");
ok(stylesSource.includes('.image-plaza__lightbox'), "图片广场应有放大查看样式");

console.log("image plaza contract: OK");
