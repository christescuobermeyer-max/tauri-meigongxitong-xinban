import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/oss-assets.ts", import.meta.url), "utf8")
  .replace(
    'import { uploadImageToOss } from "./tauri";',
    `const calls = [];
async function uploadImageToOss(req) {
  calls.push(req);
  return { url: "https://oss.example.com/" + req.file_name, key: req.file_name };
}
export function __getCalls() { return calls; }`
  )
  .replace(
    'import { compressGeneratedImage } from "./tauri-image";',
    `async function compressGeneratedImage(req) {
  calls.push({ type: "compress", req });
  return { base64_data: "compressed-" + req.max_dimension, mime_type: "image/jpeg", byte_size: 120000 };
}`
  )
  .replace('import { safeFileName } from "./utils";', 'function safeFileName(input) { return input.trim() || "shop"; }')
  .replace(/import type \{[\s\S]*?\} from "\.\.\/types";/, "");

const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const avatarUrl = await module.archiveGeneratedImage("avatar", "红冠松滋鸡", "raw-avatar");
const productUrl = await module.archiveGeneratedImage("product", "红冠松滋鸡", "raw-product");
const detailUrl = await module.archiveGeneratedImage("detail_page", "红冠松滋鸡", "raw-detail");
const calls = module.__getCalls();

// 全部 kind 都压缩成 JPG 后再上传
equal(avatarUrl, "https://oss.example.com/红冠松滋鸡-avatar.jpg");
equal(productUrl, "https://oss.example.com/红冠松滋鸡-product.jpg");
equal(detailUrl, "https://oss.example.com/红冠松滋鸡-detail_page.jpg");

// 调用顺序：compress → upload，每次归档共 2 个 calls
equal(calls.length, 6);

// avatar：768 / q82
equal(calls[0].type, "compress");
equal(calls[0].req.base64_data, "raw-avatar");
equal(calls[0].req.max_dimension, 768);
equal(calls[0].req.quality, 82);
equal(calls[1].file_name, "红冠松滋鸡-avatar.jpg");
equal(calls[1].folder, "generated");
equal(calls[1].mime_type, "image/jpeg");

// product：1024 / q88
equal(calls[2].type, "compress");
equal(calls[2].req.base64_data, "raw-product");
equal(calls[2].req.max_dimension, 1024);
equal(calls[2].req.quality, 88);
equal(calls[3].file_name, "红冠松滋鸡-product.jpg");

// detail_page：2048 / q92
equal(calls[4].type, "compress");
equal(calls[4].req.max_dimension, 2048);
equal(calls[4].req.quality, 92);
equal(calls[5].file_name, "红冠松滋鸡-detail_page.jpg");

// 没有任何 PNG 直传
ok(calls.filter((c: { file_name?: string }) => c.file_name?.endsWith(".png")).length === 0);
