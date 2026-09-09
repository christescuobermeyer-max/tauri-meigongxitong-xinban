import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const pageSource = read("src/components/video-signboard/VideoSignboardPage.tsx");
ok(pageSource.includes("导出声音"), "导出区域应提供声音设置");
ok(pageSource.includes('type="checkbox"'), "声音设置应使用二元开关控件");
ok(pageSource.includes("checked={includeAudio}"), "声音开关应绑定当前导出状态");

const hookSource = read("src/components/video-signboard/useVideoSignboard.ts");
ok(
  hookSource.includes("const [includeAudio, setIncludeAudio] = useState(false)"),
  "声音默认应关闭，保持原有导出行为",
);
equal(
  (hookSource.match(/includeAudio,/g) || []).length >= 2,
  true,
  "远程视频和本地视频导出都应传递 includeAudio",
);

const videoCommandsSource = read("src-tauri/src/video_commands.rs");
ok(videoCommandsSource.includes("include_audio: Option<bool>"), "Tauri 导出命令应接收声音参数");
ok(videoCommandsSource.includes('"0:a:0?"'), "有声导出应可选映射原视频音轨");
ok(videoCommandsSource.includes('"aac"'), "有声导出应编码为 MP4 兼容的 AAC");
ok(videoCommandsSource.includes('"-an"'), "关闭声音时应明确移除音轨");
