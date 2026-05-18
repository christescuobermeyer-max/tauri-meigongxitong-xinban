import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const sessionSrc = readFileSync(
  new URL("../src/lib/workspace-session.ts", import.meta.url),
  "utf8"
);
const generationSrc = readFileSync(
  new URL("../src/lib/workspace-generation.ts", import.meta.url),
  "utf8"
);

// 拆分后的两个 API 必须存在
ok(
  generationSrc.includes("export async function generateAssetBase64"),
  "workspace-generation 应导出 generateAssetBase64"
);
ok(
  generationSrc.includes("export async function archiveAssetToOss"),
  "workspace-generation 应导出 archiveAssetToOss"
);

// runOneGeneration 应当：先 generateAssetBase64 → setter → archiveAssetToOss → setter
const idxBase64 = sessionSrc.indexOf("generateAssetBase64({");
const idxFirstSetter = sessionSrc.indexOf('remoteUrl: ""', idxBase64);
const idxArchive = sessionSrc.indexOf("archiveAssetToOss(", idxFirstSetter);
const idxSecondSetter = sessionSrc.indexOf("setter((prev) => ({ ...prev, remoteUrl })", idxArchive);

ok(idxBase64 >= 0, "应调用 generateAssetBase64");
ok(idxFirstSetter > idxBase64, '生图后应立刻 setter 一次（remoteUrl: ""）让 UI 立刻显示');
ok(idxArchive > idxFirstSetter, "OSS 归档必须在第一次 setter 之后");
ok(idxSecondSetter > idxArchive, "OSS 完成后应再 setter 一次更新 remoteUrl");

// OSS 失败要给出友好提示且不让 UI 回退（不再 setter status=failed）
ok(
  sessionSrc.includes("已生成，但归档到云端失败"),
  "OSS 失败应只 toast，不能把已显示的图回退为 failed"
);

// recordHistory 仍依赖 remoteUrl（保持云历史完整性）
const historySrc = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8"
);
ok(
  /const remoteUrl = item\.remoteUrl;[\s\S]*?if \(!remoteUrl\) return;/.test(historySrc),
  "recordHistory 在 remoteUrl 为空时应跳过云数据库写入"
);

console.log("workspace-session ui-first contract: OK");
