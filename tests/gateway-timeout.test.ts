import { rejects } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/desktop/gateway.ts", import.meta.url), "utf8")
  .replace('import { supabase } from "../supabase";', 'const supabase = {auth: {getSession: async () => ({data: {session: {access_token: "test-token"}}})}};')
  .replace("import.meta.env.VITE_BACKEND_GATEWAY_URL", '"https://gateway.invalid"');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const gateway = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
Object.assign(globalThis, { window: { setTimeout, clearTimeout }, fetch: async () => { throw new DOMException("aborted", "AbortError"); } });
try {
  await rejects(gateway.callBackendGateway("/api/generate-image", {}, { timeoutMs: 1 }), /请先查看历史记录/);
  await rejects(gateway.callBackendGateway("/api/menu-organize", {}, { timeoutMs: 1 }), /请求超过/);
} finally {
  Object.assign(globalThis, { window: originalWindow, fetch: originalFetch });
}
console.log("生图超时提示保留结果不确定语义，避免重复提交");
