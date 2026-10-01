import { readFileSync } from "node:fs";
import ts from "typescript";

/** 数据模块测试复用真实提示词构造，网络边界仍由调用方模拟。 */
export function inlinePromptConfig(source: string): string {
  const ast = ts.createSourceFile("test-source.ts", source, ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter((node) => ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "./prompt-config");
  let body = source;
  for (const node of [...imports].reverse()) body = body.slice(0, node.getStart(ast)) + body.slice(node.end);
  const prompt = readFileSync(new URL("../../src/lib/prompt-config.ts", import.meta.url), "utf8");
  const promptAst = ts.createSourceFile("prompt.ts", prompt, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter();
  const definitions = promptAst.statements.filter((node) => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
    .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, promptAst)).join("\n");
  return `${body}\n${definitions}`;
}
