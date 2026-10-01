import { deepEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../src/lib/generation/session-generation.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("session.ts", source, ts.ScriptTarget.Latest, true);
const printer = ts.createPrinter();
const body = ast.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => printer.printNode(ts.EmitHint.Unspecified, node, ast)).join("\n");
const injected = `
const console = {warn: () => undefined};
let events = [];
let failArchive = false;
let failGeneration = false;
let generatedRemote = "";
const getAssetLabel = () => "产品图";
const getAutoRetryAttempt = () => 1;
const getSetterByKind = (_kind, setters) => setters.product;
const runWithAutoRetry = async ({onAttempt, run}) => { onAttempt(1); return {...await run(), attempt: 1}; };
const generateAssetBase64 = async () => { if (failGeneration) throw new Error("生成失败"); return {rawBase64: "base64", rawDataUrl: "data:image/png;base64,base64", remoteUrl: generatedRemote, generationLine: "line5", elapsedMs: 10}; };
const archiveAssetToOss = async () => {events.push("archive"); if(failArchive) throw new Error("归档失败"); return "https://oss.example.com/result.png";};
export function setup(archiveError, generationError, remote) {events=[];failArchive=archiveError;failGeneration=generationError;generatedRemote=remote;return events;}
export function update(item) {events.push(typeof item === "function" ? "update-url" : item.status);}
`;
const output = ts.transpileModule(injected + body, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const session = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const options = { kind: "product", shopName: "测试店", setters: { product: session.update }, onToast: () => undefined };
let events = session.setup(false, false, "");
let result = await session.runOneGeneration(options);
deepEqual(events, ["update-url", "succeeded", "archive", "update-url"], "原图先进入成功态，再归档和补 URL");
equal(result.remoteUrl, "https://oss.example.com/result.png");
events = session.setup(true, false, "");
result = await session.runOneGeneration(options);
deepEqual(events, ["update-url", "succeeded", "archive"], "归档失败不得撤销已生成图片");
equal(result.rawBase64, "base64");
equal(result.remoteUrl, "");
events = session.setup(false, true, "");
equal(await session.runOneGeneration(options), null);
deepEqual(events, ["update-url", "update-url"], "生成失败不能误报成功或归档");
events = session.setup(false, false, "https://oss.example.com/gateway.png");
result = await session.runOneGeneration(options);
ok(!events.includes("archive"), "网关已经归档时不得重复上传");
equal(result.remoteUrl, "https://oss.example.com/gateway.png");
console.log("前端生成会话行为检查通过");
