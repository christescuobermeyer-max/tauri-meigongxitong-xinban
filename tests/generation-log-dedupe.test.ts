import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const helperSource = readFileSync(
  new URL("../src/lib/generation-log-dedupe.ts", import.meta.url),
  "utf8"
);
const helperTranspiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const { markGenerationLogRecorded } = await import(
  `data:text/javascript;base64,${Buffer.from(helperTranspiled).toString("base64")}`
);

const recorded = new Set<string>();

equal(markGenerationLogRecorded(recorded, "product", "https://example.com/a.png"), true);
equal(markGenerationLogRecorded(recorded, "product", "https://example.com/a.png"), false);
equal(markGenerationLogRecorded(recorded, "avatar", "https://example.com/a.png"), true);
equal(markGenerationLogRecorded(recorded, "product", " https://example.com/a.png "), false);

const workspaceSource = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8"
);

equal(workspaceSource.includes("markGenerationLogRecorded"), true);
