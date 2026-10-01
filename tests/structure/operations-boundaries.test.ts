import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

for (const file of ["export-oss-images-incremental.mjs", "export-oss-images.mjs", "export-user-today-images-by-shop.mjs", "organize-by-operator.mjs"]) {
  const source = readFileSync(new URL(`../../scripts/${file}`, import.meta.url), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let count = source.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((line) => line.trim()).length;
  for (const node of ast.statements) if (ts.isImportDeclaration(node)) count -= node.getText(ast).split(/\r?\n/).length;
  ok(count <= 200, `${file} 应按查询、文件与表格职责拆分，当前 ${count}`);
  ok(source.includes("main("), "保留原有命令入口");
}
console.log("导出运维脚本职责规模验证通过");
