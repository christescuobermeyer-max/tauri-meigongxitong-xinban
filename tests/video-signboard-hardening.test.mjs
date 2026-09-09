import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const videoCommandsSource = read("src-tauri/src/video_commands.rs");
ok(videoCommandsSource.includes("CREATE_NO_WINDOW"), "Windows 子进程应隐藏 FFmpeg/yt-dlp 控制台窗口");
ok(videoCommandsSource.includes("hide_child_window"), "FFmpeg/yt-dlp 命令应统一套用隐藏窗口辅助函数");
ok(videoCommandsSource.includes("prepare_local_video_preview"), "上传本地视频后应先生成 WebView2 兼容预览 MP4");
ok(videoCommandsSource.includes("read_video_dimensions"), "导出前应读取真实视频尺寸");
ok(videoCommandsSource.includes("normalize_crop_for_video"), "导出前应把裁剪参数限制在真实视频范围内");
ok(videoCommandsSource.includes("ensure_mp4_file_name"), "导出文件名应强制补齐 .mp4 后缀");
ok(videoCommandsSource.includes("looks_like_html_response"), "下载远程视频时应拒绝把 HTML/JSON 错误页保存为 MP4");
ok(videoCommandsSource.includes("headers: Option<HashMap<String, String>>"), "本地下载应接收网关解析出的安全请求头");
ok(videoCommandsSource.includes("is_safe_video_download_header"), "本地下载应过滤敏感请求头");
ok(videoCommandsSource.includes('contains("fresh cookies")'), "抖音解析应识别 yt-dlp 的 Fresh cookies 错误");
ok(videoCommandsSource.includes("请用已登录抖音的浏览器重新导出抖音cookie.txt"), "抖音 cookie 过期时应提示重新导出 cookie");

const cookieSupportSource = read("src-tauri/src/xiaohongshu_cookie_support.rs");
ok(cookieSupportSource.includes("score_cookie_file_candidate"), "应按 cookie 新鲜度选择候选文件");
ok(cookieSupportSource.includes("fresh_important_count"), "应优先使用关键 cookie 未过期的文件");

const libSource = read("src-tauri/src/lib.rs");
ok(libSource.includes("video_commands::prepare_local_video_preview"), "Tauri 应注册本地视频预览转码命令");

const hookSource = read("src/components/video-signboard/useVideoSignboard.ts");
ok(hookSource.includes("prepare_local_video_preview"), "本地视频上传流程应调用兼容预览转码命令");

const editorSource = read("src/components/video-signboard/VideoEditor.tsx");
ok(editorSource.includes("onError"), "视频预览失败时应给出错误回调，而不是只显示黑屏");

const historySource = read("src/components/video-signboard/VideoHistory.tsx");
ok(historySource.includes("ensureMp4Path"), "视频另存路径应强制补齐 .mp4 后缀");
