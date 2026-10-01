import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../src/hooks/usePictureWallWorkspace.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("picture-wall.ts", source, ts.ScriptTarget.Latest, true);
let count = source.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((line) => line.trim()).length;
for (const node of ast.statements) if (ts.isImportDeclaration(node)) count -= node.getText(ast).split(/\r?\n/).length;
ok(count <= 200, "图片墙状态与下载职责应分别维护");
