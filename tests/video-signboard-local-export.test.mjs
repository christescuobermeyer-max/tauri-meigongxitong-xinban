import { ok, equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const hookSource = read("src/components/video-signboard/useVideoSignboard.ts");
ok(hookSource.includes("get_video_export_path"));
ok(hookSource.includes("setExportPath"));
ok(hookSource.includes("extractFolderPath"));

const videoCommandsSource = read("src-tauri/src/video_commands.rs");
ok(videoCommandsSource.includes("export_path"));
ok(videoCommandsSource.includes("get_video_export_path"));
ok(videoCommandsSource.includes("resolve_export_dir"));
ok(videoCommandsSource.includes("blocking_pick_folder"));
ok(videoCommandsSource.includes("选择视频导出保存位置"));
equal(videoCommandsSource.includes('document_dir.join("VideoExports")'), false);

const libSource = read("src-tauri/src/lib.rs");
ok(libSource.includes("video_commands::get_video_export_path"));
