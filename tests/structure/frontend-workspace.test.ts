import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../src/hooks/generation/useWorkspaceSlots.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("slots.ts", source, ts.ScriptTarget.Latest, true);
const slotHooks = ["useThreePieceWorkspace", "useProductImageWorkspace", "useProductBatchWorkspace", "usePackageImageWorkspace", "usePictureWallWorkspace", "usePSignboardWorkspace", "useImageEditWorkspace", "useDetailPageWorkspace", "useBrandStoryWorkspace", "useDataAnalysisWorkspace"];
const calls = new Map<string, number>();
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const name = node.expression.text;
    if (slotHooks.includes(name) || name === "useMenuDesignWorkspace") {
      calls.set(name, (calls.get(name) ?? 0) + 1);
      let parent = node.parent;
      while (parent && !ts.isFunctionDeclaration(parent)) {
        ok(!ts.isIterationStatement(parent, false), "槽位钩子不得在循环内调用");
        ok(!ts.isArrowFunction(parent) && !ts.isConditionalExpression(parent) && !ts.isIfStatement(parent), "槽位钩子不得按条件或回调调用");
        parent = parent.parent;
      }
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
for (const name of slotHooks) equal(calls.get(name), 10, `${name} 应常驻 10 个独立槽位`);
equal(calls.get("useMenuDesignWorkspace"), 1, "菜单设计应常驻 1 个槽位");
const history = readFileSync(new URL("../../src/hooks/generation/useWorkspaceHistory.ts", import.meta.url), "utf8");
const recorder = readFileSync(new URL("../../src/hooks/generation/useWorkspaceHistoryRecorder.ts", import.meta.url), "utf8");
equal((history + recorder).includes("cleanupExpiredGenerationLogs"), false, "客户端不得触发全局历史清理");
ok(recorder.includes("markGenerationLogRecorded"), "保留成功记录去重");
ok(history.includes("cancelled"), "切换用户后的旧请求不得覆盖新历史");
console.log("前端常驻槽位与历史职责检查通过");
