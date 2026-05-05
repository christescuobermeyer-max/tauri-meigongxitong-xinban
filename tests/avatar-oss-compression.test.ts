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
  return { base64_data: "compressed-avatar", mime_type: "image/jpeg", byte_size: 120000 };
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
const calls = module.__getCalls();

equal(avatarUrl, "https://oss.example.com/红冠松滋鸡-avatar.jpg");
equal(productUrl, "https://oss.example.com/红冠松滋鸡-product.png");
equal(calls[0].type, "compress");
equal(calls[0].req.base64_data, "raw-avatar");
equal(calls[1].base64_data, "compressed-avatar");
equal(calls[1].mime_type, "image/jpeg");
equal(calls[1].file_name, "红冠松滋鸡-avatar.jpg");
ok(calls.every((call: { type?: string }) => call.type !== "compress" || call.req.max_dimension === 768));
