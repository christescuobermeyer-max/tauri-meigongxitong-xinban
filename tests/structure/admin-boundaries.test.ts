import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

for (const file of ["AdminBalancePanel.tsx", "AdminGatewayMonitor.tsx", "LineChart.tsx"]) {
  const source = readFileSync(new URL(`../../src/components/admin/${file}`, import.meta.url), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let count = source.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((line) => line.trim()).length;
  for (const node of ast.statements) {
    if (ts.isImportDeclaration(node)) count -= node.getText(ast).split(/\r?\n/).length;
  }
  ok(count <= 200, `${file} 职责模块不能超过 200 有效行，当前 ${count}`);
}
console.log("后台组件职责规模验证通过");
