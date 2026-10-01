import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const session = readFileSync(new URL("../src/lib/generation/session-generation.ts", import.meta.url), "utf8");
const generatedIndex = session.indexOf("generateAssetBase64({");
const displayedIndex = session.indexOf("setter({", generatedIndex);
const archiveIndex = session.indexOf("archiveAssetToOss(", displayedIndex);
const refreshedIndex = session.indexOf("setter((prev) => ({ ...prev, remoteUrl })", archiveIndex);
ok(generatedIndex >= 0);
ok(displayedIndex > generatedIndex, "生成成功立即更新展示");
ok(archiveIndex > displayedIndex, "本地归档不能延迟首次展示");
ok(refreshedIndex > archiveIndex, "归档完成后补充地址");
ok(!session.slice(archiveIndex).includes('status: "failed"'), "归档失败不能回退生成成功状态");
const recorder = readFileSync(new URL("../src/hooks/generation/useWorkspaceHistoryRecorder.ts", import.meta.url), "utf8");
ok(/if \(!remoteUrl\) \{[\s\S]*?return;/.test(recorder), "没有归档地址不能写云端历史");
ok(recorder.includes("本次未计入云端历史/今日统计"), "归档失败应明确提示统计未保存");
console.log("生成结果展示优先和归档失败隔离验证通过");
