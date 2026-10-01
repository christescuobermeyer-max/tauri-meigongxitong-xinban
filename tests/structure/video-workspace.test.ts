import { equal, ok } from "node:assert/strict";
import { existsSync } from "node:fs";

const moduleUrl = new URL("../../src/components/video-signboard/helpers.ts", import.meta.url);
ok(existsSync(moduleUrl), "视频链接解析与路径辅助应独立维护");
const helpers = await import(moduleUrl.href);
equal(helpers.detectPlatform("https://v.douyin.com/example/"), "douyin");
equal(helpers.detectPlatform("https://xhslink.com/example"), "xiaohongshu");
equal(helpers.detectPlatform("普通文字"), null);
equal(helpers.getFileStem("J:\\视频\\门头.mp4"), "门头");
equal(helpers.extractFolderPath("J:\\视频\\门头.mp4"), "J:\\视频");
equal(helpers.getErrorMessage({ message: "测试错误" }, "默认错误"), "测试错误");
equal(helpers.getErrorMessage(null, "默认错误"), "默认错误");
