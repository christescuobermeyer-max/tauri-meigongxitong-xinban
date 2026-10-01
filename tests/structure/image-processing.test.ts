import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSourceTree } from "../helpers/source-tree.mjs";

const url = new URL("../../src-tauri/src/image_proc.rs", import.meta.url);
const facade = readFileSync(url, "utf8");
ok(facade.split(/\r?\n/).filter((line) => line.trim()).length <= 80, "图片命令门面应只组合职责模块");
const source = readSourceTree(url);
for (const name of ["compress_generated_image", "resize_and_save_image", "save_base64_image", "select_images", "process_images"]) {
  ok(source.includes(`pub async fn ${name}`), `保留图片命令 ${name}`);
}
ok(source.includes("FilterType::Lanczos3"));
ok(source.includes("save_jpeg_with_limit_errors_when_limit_cannot_be_met"));
console.log("图片处理模块边界验证通过");
