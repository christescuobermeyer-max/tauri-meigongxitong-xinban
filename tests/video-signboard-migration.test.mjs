import { ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function exists(path) {
  return existsSync(fileURLToPath(new URL(`../${path}`, import.meta.url)));
}

ok(exists("docs/plans/2026-06-10-video-signboard-migration.md"));
ok(exists("src/components/video-signboard/VideoSignboardPage.tsx"));
ok(exists("src/components/video-signboard/useVideoSignboard.ts"));
ok(exists("src/components/video-signboard/VideoEditor.tsx"));
ok(exists("src/components/video-signboard/CropBox.tsx"));
ok(exists("src/components/video-signboard/TimelineSlider.tsx"));
ok(exists("src/components/video-signboard/VideoHistory.tsx"));
ok(exists("src/components/workspace/VideoSignboardWorkspacePage.tsx"));
ok(exists("src-tauri/src/video_commands.rs"));
ok(exists("src-tauri/src/xiaohongshu_cookie_support.rs"));
ok(exists("src-tauri/src/xiaohongshu_guard.rs"));
ok(exists("src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe"));
ok(exists("src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe"));

const workspaceSource = read("src/hooks/useGenerationWorkspace.ts");
ok(workspaceSource.includes('| "videoSignboard"'));

const sidebarSource = read("src/components/Sidebar.tsx");
ok(sidebarSource.includes('key: "videoSignboard"'));
ok(sidebarSource.includes('label: "视频店招"'));
ok(sidebarSource.includes('desc: "外卖视频裁剪导出"'));

const pagesSource = read("src/components/WorkspacePages.tsx");
ok(pagesSource.includes("VideoSignboardWorkspacePage"));
ok(pagesSource.includes('workspace.tab === "videoSignboard"'));

const shellSource = read("src/components/WorkspaceShell.tsx");
ok(shellSource.includes('workspace.tab === "videoSignboard"'));
ok(shellSource.includes('"视频店招"'));

const iconsSource = read("src/components/Icons.tsx");
ok(iconsSource.includes("IconVideo"));
ok(iconsSource.includes("IconPlay"));
ok(iconsSource.includes("IconPause"));
ok(iconsSource.includes("IconScissors"));
ok(iconsSource.includes("IconFolder"));

const pageSource = read("src/components/video-signboard/VideoSignboardPage.tsx");
ok(pageSource.includes("外卖视频店招制作工具"));
ok(pageSource.includes("导出为美团视频店招"));
ok(pageSource.includes("导出为淘宝闪购视频店招"));
ok(pageSource.includes("VideoHistory"));

const hookSource = read("src/components/video-signboard/useVideoSignboard.ts");
ok(hookSource.includes("parseDouyinVideo"));
ok(hookSource.includes("parse_xiaohongshu"));
ok(hookSource.includes("downloadArgs.headers"));
ok(hookSource.includes("headers: videoSource.info.headers"));
ok(hookSource.includes("process_video"));
ok(hookSource.includes("process_local_video"));
ok(hookSource.includes("taobaoFlash"));

const frontendTauriSource = read("src/lib/tauri.ts");
ok(frontendTauriSource.includes("parseDouyinVideo"));
ok(frontendTauriSource.includes('"/api/video/parse-douyin"'));
ok(frontendTauriSource.includes('"parse_douyin"'), "未配置网关时仍应保留本地抖音解析兜底");

const cssSource = read("src/styles/global.css");
ok(cssSource.includes(".video-signboard"));
ok(cssSource.includes(".video-signboard-editor"));
ok(cssSource.includes(".video-signboard-history"));

const libSource = read("src-tauri/src/lib.rs");
ok(libSource.includes("mod video_commands;"));
ok(libSource.includes("mod xiaohongshu_cookie_support;"));
ok(libSource.includes("mod xiaohongshu_guard;"));
ok(libSource.includes("video_commands::parse_douyin"));
ok(libSource.includes("video_commands::parse_xiaohongshu"));
ok(libSource.includes("video_commands::process_video"));
ok(libSource.includes("video_commands::process_local_video"));
ok(libSource.includes("video_commands::list_exported_videos"));
ok(libSource.includes("video_commands::copy_video_file"));

const videoCommandsSource = read("src-tauri/src/video_commands.rs");
ok(videoCommandsSource.includes("prepare_named_cookie_args"), "抖音解析应支持独立 cookie 文件入口");
ok(videoCommandsSource.includes("抖音cookie.txt"), "抖音解析应查找抖音cookie.txt");
ok(videoCommandsSource.includes("--referer"), "抖音 yt-dlp 请求应携带 Referer");
ok(videoCommandsSource.includes("is_douyin_url"), "抖音解析应支持完整 douyin.com 链接");
ok(videoCommandsSource.includes("is_safe_video_download_header"), "本地视频下载应过滤网关返回的请求头");
ok(videoCommandsSource.includes("download_video(video_url, platform, headers"), "远程视频导出应复用解析返回的下载请求头");

const gatewaySource = read("src-tauri/src/bin/backend_gateway.rs");
ok(gatewaySource.includes('"/api/video/parse-douyin"'), "网关应提供抖音解析接口");
ok(gatewaySource.includes("parse_douyin_video_with_ytdlp"), "网关应只解析抖音直链");
ok(gatewaySource.includes("DOUYIN_COOKIE_PATH"), "网关应支持服务器侧抖音 cookie 路径配置");
ok(!gatewaySource.includes("download_douyin_video_to_oss"), "网关不应下载抖音视频到 OSS");

const cookieSupportSource = read("src-tauri/src/xiaohongshu_cookie_support.rs");
ok(cookieSupportSource.includes("resource_dir"), "cookie 查找应覆盖 Tauri 打包资源目录");
ok(cookieSupportSource.includes('"_up_"'), "cookie 查找应覆盖 Tauri Windows 安装资源子目录");

const cargoSource = read("src-tauri/Cargo.toml");
ok(cargoSource.includes('regex = "1.10"'));
ok(cargoSource.includes("uuid ="));

const tauriConfigSource = read("src-tauri/tauri.conf.json");
ok(tauriConfigSource.includes('"assetProtocol"'));
ok(tauriConfigSource.includes('"externalBin"'));
ok(tauriConfigSource.includes('"resources"'));
ok(tauriConfigSource.includes('"../抖音cookie.txt"'), "抖音 cookie 应作为本机私密资源打进安装包");
ok(tauriConfigSource.includes('"binaries/ffmpeg"'));
ok(tauriConfigSource.includes('"binaries/yt-dlp"'));
