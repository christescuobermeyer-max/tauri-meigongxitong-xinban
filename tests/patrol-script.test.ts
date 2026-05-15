import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/patrol-script.ts", import.meta.url), "utf8")
  .replace('import type { GenerationLine } from "../types";', "");
const pageSource = readFileSync(
  new URL("../src/components/PatrolScriptPage.tsx", import.meta.url),
  "utf8"
);
const hookSource = readFileSync(
  new URL("../src/hooks/usePatrolScriptWorkspace.ts", import.meta.url),
  "utf8"
);
const styleSource = readFileSync(
  new URL("../src/styles/patrol-script.css", import.meta.url),
  "utf8"
);

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const prompt = module.buildPatrolScriptPrompt(
  "山饺下",
  "老板，今天我们把您店铺最近的客户咨询记录看了下。客服回得到位，差评能减掉一大半。"
);

ok(prompt.includes("山饺下"));
ok(prompt.includes("老板，今天我们把您店铺最近的客户咨询记录看了下。客服回得到位，差评能减掉一大半。"));
ok(prompt.includes("请为下面这段文字生成一张竖版知识卡片图片平面设计"));
ok(prompt.includes("浅色主题色"));
ok(prompt.includes("垂直杂志风格单页信息图"));
ok(prompt.includes("有吸引力、有视觉冲击力"));
ok(prompt.includes("文字必须正确"));
ok(prompt.includes("不乱码"));
ok(prompt.includes("不变形"));
ok(prompt.includes("左上角"));
ok(prompt.includes("右下角"));
ok(prompt.includes("呈尚策划运营部"));
ok(prompt.includes("不得改写"));
ok(!prompt.includes("横版卡片图片"));
ok(!prompt.includes("风格可以自由发挥"));
ok(!prompt.includes("不要添加其他文字"));
ok(!prompt.includes("高级商业提案风"));
ok(!prompt.includes("专业诊断报告"));
ok(!prompt.includes("斜切构图"));
ok(!prompt.includes("半透明数据面板"));
ok(!prompt.includes("增长曲线"));
ok(!prompt.includes("科技蓝"));
ok(!prompt.includes("墨绿"));

equal(module.resolvePatrolScriptSize("line1"), "1536x1024");
equal(module.resolvePatrolScriptSize("line2"), "1536x1024");
equal(module.resolvePatrolScriptSize("line3"), "1536x1024");
equal(module.resolvePatrolScriptSize("line4"), "16:9");
equal(module.resolvePatrolScriptSize("line5"), "16:9");
equal(module.PATROL_SCRIPT_EXPORT_SIZE.w, 1024);
equal(module.PATROL_SCRIPT_EXPORT_SIZE.h, 1536);
ok(hookSource.includes("target_width: PATROL_SCRIPT_EXPORT_SIZE.w"));
ok(hookSource.includes("target_height: PATROL_SCRIPT_EXPORT_SIZE.h"));

ok(pageSource.includes("onCopyScript"));
ok(pageSource.includes("onCopyScript(s)"));
ok(pageSource.includes("onCopyScript(selectedScript)"));
ok(pageSource.includes("点击话术可复制正文"));
ok(pageSource.includes("点击复制当前话术正文"));
ok(styleSource.includes(".patrol-script-preview__body:hover"));
ok(hookSource.includes("handleCopyScript"));
ok(!hookSource.includes("maxAttempts:"));
ok(hookSource.includes("navigator.clipboard.writeText(selectedScript.content)"));
ok(hookSource.includes("巡店话术已复制到剪贴板"));
ok(hookSource.includes("复制失败，请手动选中话术复制"));
