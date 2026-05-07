import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const retrySource = readFileSync(new URL("../src/lib/generation-retry.ts", import.meta.url), "utf8");
const retryModule = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(retrySource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText).toString("base64")}`
);

let lastAttempt = 0;
const success = await retryModule.runWithAutoRetry({
  onAttempt: (attempt: number) => {
    lastAttempt = attempt;
  },
  run: async (attempt: number) => {
    if (attempt === 1) throw new Error("first failed");
    return { value: "ok" };
  },
});

equal(success.value, "ok");
equal(success.attempt, 2);
equal(lastAttempt, 2);

let capturedError: unknown;
try {
  await retryModule.runWithAutoRetry({
    onAttempt: () => undefined,
    run: async (attempt: number) => {
      throw new Error(`failed-${attempt}`);
    },
  });
} catch (error: unknown) {
  capturedError = error;
}

ok(capturedError instanceof Error);
equal((capturedError as { attempt?: number }).attempt, 2);
equal((capturedError as Error).message, "failed-2");
