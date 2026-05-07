import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspaceSource = readFileSync(
  new URL("../src/lib/workspace-generation.ts", import.meta.url),
  "utf8"
);
const apiSource = readFileSync(new URL("../src-tauri/src/api.rs", import.meta.url), "utf8");
const pockgoFormatSource = readFileSync(
  new URL("../src-tauri/src/pockgo_chat_format.rs", import.meta.url),
  "utf8"
);
const tauriSource = readFileSync(new URL("../src/lib/tauri.ts", import.meta.url), "utf8");
const rustEntrySource = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

equal(
  workspaceSource.includes("generatePosterImage"),
  false,
  "海报生成不应再走旧的专用 Gemini 海报接口"
);
ok(
  workspaceSource.includes("api_line: generationLine"),
  "海报生成应和其他 image-2 任务一样透传线路"
);
ok(apiSource.includes('"21:9"'), "Rust image-2 请求校验应允许 21:9 海报尺寸");
ok(
  pockgoFormatSource.includes('"21:9" => "21:9"'),
  "线路4 pockgo 的比例映射应支持 21:9"
);
ok(
  pockgoFormatSource.includes('"1792x1024" => "16:9"'),
  "线路4 pockgo 的店招比例应按 16:9 控制"
);
equal(tauriSource.includes("generatePosterImage"), false, "前端不应保留旧海报专用 IPC 包装");
equal(
  rustEntrySource.includes("generate_poster_image"),
  false,
  "Tauri 不应继续注册旧海报专用命令"
);
