import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const tauriStubs = `
async function uploadImageToOss(req) { return { url: "https://oss.example.com/" + req.file_name, key: req.file_name }; }
async function generateArchivedImageWithLine() { return { image: "abc", generationLine: "line2" }; }
`;
const retryStub = `
async function runWithAutoRetry(options) { return { ...(await options.run()), attempt: 1 }; }
`;
const libSource = readFileSync(new URL("../src/lib/picture-wall.ts", import.meta.url), "utf8")
  .replace('import { generateArchivedImageWithLine, uploadImageToOss } from "./tauri";', tauriStubs)
  .replace('import { resolveGeneratedArchiveUrl } from "./oss-assets";', "")
  .replace('import { runWithAutoRetry } from "./generation-retry";', retryStub)
  .replace('import { safeFileName } from "./utils";', "function safeFileName(input) { return input.trim() || 'shop'; }");
const libTranspiled = ts.transpileModule(libSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const libModule = await import(`data:text/javascript;base64,${Buffer.from(libTranspiled).toString("base64")}`);

deepEqual(libModule.PICTURE_WALL_TARGET_COUNTS, [1, 2, 3]);
equal(libModule.DEFAULT_PICTURE_WALL_TARGET_COUNT, 3);

const images = [
  { id: "a", name: "a.jpg" },
  { id: "b", name: "b.jpg" },
  { id: "c", name: "c.jpg" },
];
deepEqual(
  libModule.limitPictureWallImages(images, 1).map((image: { id: string }) => image.id),
  ["a"]
);
deepEqual(
  libModule.limitPictureWallImages(images, 2).map((image: { id: string }) => image.id),
  ["a", "b"]
);
deepEqual(
  libModule.limitPictureWallImages(images, 3).map((image: { id: string }) => image.id),
  ["a", "b", "c"]
);

ok(libModule.getPictureWallCopyText(1).includes("这张专业图片墙"));
ok(libModule.getPictureWallCopyText(2).includes("这两张统一风格的图片"));
ok(libModule.getPictureWallCopyText(3).includes("这三张统一风格的图片"));

const hookSource = readFileSync(new URL("../src/hooks/usePictureWallWorkspace.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/components/PictureWallPage.tsx", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../src/components/PictureWallResults.tsx", import.meta.url), "utf8");
const pictureWallCss = readFileSync(new URL("../src/styles/picture-wall.css", import.meta.url), "utf8");

ok(hookSource.includes("DEFAULT_PICTURE_WALL_TARGET_COUNT"), "hook 应默认生成 3 张图片墙");
ok(hookSource.includes("limitPictureWallImages(current, next)"), "目标数量降低时应保留前 N 张图片");
ok(hookSource.includes("images.length !== targetCount"), "校验应要求上传数量等于目标数量");
ok(hookSource.includes("`请上传 ${targetCount} 张产品图片`"), "校验提示应显示动态目标数量");
ok(hookSource.includes("`正在按顺序生成 ${targetCount} 张图片墙，请耐心等待…`"), "生成提示应显示动态目标数量");
ok(pageSource.includes("PICTURE_WALL_TARGET_COUNTS.map"), "页面应渲染 1/2/3 张生成数量选择");
ok(pageSource.includes('role="radiogroup"'), "生成数量应是互斥选择控件");
ok(pageSource.includes("maxCount={targetCount}"), "上传上限应跟随目标数量");
ok(pageSource.includes("onClick={() => setTargetCount(count)}"), "点击数量按钮应更新目标数量");
ok(pageSource.includes("dropzoneTitle={`点击、拖拽或 Ctrl+V 粘贴 ${targetCount} 张图片墙产品图`}"));
ok(resultsSource.includes("getPictureWallCopyText(targetCount)"), "沟通文案应按目标数量动态生成");
ok(resultsSource.includes("已完成 {completedCount} / {targetCount}"), "结果进度应按目标数量展示");
ok(resultsSource.includes("上传 {targetCount} 张产品图后即可生成图片墙"), "空状态应按目标数量提示上传");
ok(pictureWallCss.includes(".picture-wall-count-select"), "图片墙数量控件应有样式覆盖");

console.log("picture wall count selection contract: OK");
