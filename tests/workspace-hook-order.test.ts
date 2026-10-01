import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("workspace.ts", source, ts.ScriptTarget.Latest, true);
const calls: string[] = [];
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    if (["useWorkspaceHistory", "useWorkspaceSlots"].includes(node.expression.text)) {
      let parent: ts.Node | undefined = node.parent;
      while (parent && !ts.isFunctionDeclaration(parent)) {
        ok(!ts.isIfStatement(parent) && !ts.isIterationStatement(parent, false), "工作区组合钩子必须无条件调用");
        parent = parent.parent;
      }
      calls.push(node.expression.text);
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
equal(calls.join(","), "useWorkspaceHistory,useWorkspaceSlots");
ok(source.includes("...history, ...slots"), "保留历史和常驻工具返回契约");
const history = readFileSync(new URL("../src/hooks/generation/useWorkspaceHistory.ts", import.meta.url), "utf8");
ok(history.includes("fetchGenerationLogsPage(userId"), "分页读取仍由历史职责处理");
